import os
import re
import shutil
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool
from yt_dlp import YoutubeDL

# Prevent yt-dlp self-updates in hosted envs
os.environ.setdefault("YT_DLP_NO_UPDATE", "1")

app = FastAPI(title="YT Convert API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RATE_LIMIT_WINDOW_MS = int(os.getenv("RATE_LIMIT_WINDOW_MS", "120000"))
RATE_LIMIT_MAX = int(os.getenv("RATE_LIMIT_MAX", "8"))
CACHE_TTL_MS = int(os.getenv("CACHE_TTL_MS", "600000"))

rate_limit_map: Dict[str, Dict[str, Any]] = {}
info_cache: Dict[str, Dict[str, Any]] = {}

YTDL_BASE_OPTS = {
    "quiet": True,
    "no_warnings": True,
    "noplaylist": True,
    "cachedir": False,
    "forceipv4": True,
    # Use cookies.txt for restricted/age-gated videos
    "cookiefile": "assets/yt_cookies.txt",
}

YTDL_INFO_OPTS = {
    **YTDL_BASE_OPTS,
    "skip_download": True,
    "extract_flat": False,
    # Try all reasonable fallback chains for YouTube
    "format": "bestvideo*+bestaudio/best/best[ext=mp4]/best",
}

VALID_URL_RE = re.compile(r"^(https?://)?(www\.)?(youtube\.com|youtu\.be)/.+", re.IGNORECASE)


def client_ip(req: Request) -> str:
    xf = req.headers.get("x-forwarded-for")
    if xf:
        return xf.split(",")[0].strip()
    return req.client.host if req.client else "unknown"


def enforce_rate_limit(ip: str):
    now = time.time() * 1000
    record = rate_limit_map.get(ip, {"count": 0, "reset": now + RATE_LIMIT_WINDOW_MS})
    if now > record["reset"]:
        record = {"count": 0, "reset": now + RATE_LIMIT_WINDOW_MS}
    record["count"] += 1
    rate_limit_map[ip] = record
    if record["count"] > RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="Too many requests. Please wait and try again.")


def extract_video_id(url: str) -> str:
    # Remove any list, index, or extra params
    # Accepts all YouTube URL forms
    patterns = [
        r"(?:v=)([\w-]{11})",
        r"youtu\.be/([\w-]{11})",
        r"embed/([\w-]{11})",
    ]
    for pat in patterns:
        m = re.search(pat, url)
        if m:
            return m.group(1)
    return ""


def best_thumb(thumbnails: List[Dict[str, Any]]) -> str:
    if not thumbnails:
        return ""
    sorted_thumbs = sorted(thumbnails, key=lambda t: t.get("width", 0) * t.get("height", 0), reverse=True)
    return sorted_thumbs[0].get("url") or ""


def to_formats(info: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    fmts = info.get("formats", []) or []
    video: List[Dict[str, Any]] = []
    audio: List[Dict[str, Any]] = []

    for f in fmts:
        ext = f.get("ext") or f.get("container")
        size = f.get("filesize") or f.get("filesize_approx")
        quality = f.get("format_note") or f.get("quality_label") or f.get("resolution")

        if f.get("vcodec") != "none" and f.get("acodec") != "none" and ext in {"mp4", "m4a", "webm"}:
            video.append({
                "itag": str(f.get("format_id")),
                "quality": quality or (f.get("height") and f"{f.get('height')}p" ) or "Video",
                "container": ext or "mp4",
                "filesize": size,
                "fps": f.get("fps"),
                "height": f.get("height"),
                "width": f.get("width"),
            })
        elif f.get("vcodec") == "none" and f.get("acodec") != "none":
            audio.append({
                "itag": str(f.get("format_id")),
                "quality": f.get("abr") and f"{f.get('abr')}kbps" or "Audio",
                "container": ext or "m4a",
                "filesize": size,
                "fps": None,
            })

    def uniq(sorted_list: List[Dict[str, Any]], key: str) -> List[Dict[str, Any]]:
        seen = set()
        unique = []
        for item in sorted_list:
            marker = (item.get(key), item.get("container"))
            if marker in seen:
                continue
            seen.add(marker)
            unique.append(item)
        return unique

    video_sorted = sorted(video, key=lambda f: (f.get("height", 0), f.get("fps") or 0), reverse=True)
    audio_sorted = sorted(audio, key=lambda f: f.get("quality", ""), reverse=True)

    return {
        "video": uniq(video_sorted, "quality")[:8],
        "audio": uniq(audio_sorted, "quality")[:6],
    }


def sanitize_name(name: str) -> str:
    cleaned = re.sub(r"[\\/:*?\"<>|]", "", name).strip()
    return cleaned or "video"


def ytdlp_info(url: str) -> Dict[str, Any]:
    # Try with a robust fallback chain for YouTube
    try:
        with YoutubeDL(YTDL_INFO_OPTS) as ydl:
            return ydl.extract_info(url, download=False)
    except Exception as exc:
        msg = str(exc).lower()
        # Try with even more basic fallback if all else fails
        fallback_opts = {
            **YTDL_BASE_OPTS,
            "skip_download": True,
            "extract_flat": False,
            "format": "best",
        }
        try:
            with YoutubeDL(fallback_opts) as ydl:
                return ydl.extract_info(url, download=False)
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to fetch video info. No formats available for this video.")


def ytdlp_download(url: str, format_id: str, tmp_dir: str) -> Tuple[Dict[str, Any], str]:
    outtmpl = os.path.join(tmp_dir, "%(title)s.%(ext)s")
    opts = {
        **YTDL_BASE_OPTS,
        "format": format_id,
        "outtmpl": outtmpl,
        "merge_output_format": "mp4",
    }
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        filepath = ydl.prepare_filename(info)
    return info, filepath


@app.post("/api/info")
async def api_info(payload: Dict[str, Any], request: Request):
    ip = client_ip(request)
    enforce_rate_limit(ip)

    url = (payload.get("url") or "").strip()
    if not url or not VALID_URL_RE.match(url):
        raise HTTPException(status_code=400, detail="Please provide a valid YouTube URL.")

    video_id = extract_video_id(url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Could not extract video ID from URL.")

    # Always reconstruct a clean video URL (removes list/index/extra params)
    clean_url = f"https://www.youtube.com/watch?v={video_id}"

    cached = info_cache.get(video_id)
    now = time.time() * 1000
    if cached and now - cached["timestamp"] < CACHE_TTL_MS:
        return cached["data"]


    try:
        info = await run_in_threadpool(ytdlp_info, clean_url)
    except Exception as exc:  # yt-dlp throws varied exceptions
        msg = str(exc).lower()
        if "private" in msg or "unavailable" in msg:
            raise HTTPException(status_code=404, detail="This video is unavailable or restricted.")
        if "requested format is not available" in msg or "no video formats" in msg or "no formats" in msg:
            raise HTTPException(status_code=400, detail="No downloadable formats are available for this video. It may be region-locked, private, or restricted by YouTube. Please try another video.")
        raise HTTPException(status_code=500, detail="Failed to fetch video info. Please try again.")

    formats = to_formats(info)
    if not formats["video"] and not formats["audio"]:
        raise HTTPException(status_code=400, detail="No downloadable formats are available for this video. It may be region-locked, private, or restricted by YouTube. Please try another video.")

    video_details = {
        "title": info.get("title") or "Unknown Title",
        "author": info.get("uploader") or info.get("channel") or "Unknown Author",
        "lengthSeconds": int(info.get("duration") or 0),
        "viewCount": int(info.get("view_count") or 0),
        "thumbnail": best_thumb(info.get("thumbnails") or []),
        "description": (info.get("description") or "")[:200],
        "uploadDate": info.get("upload_date") or "",
    }

    payload = {"success": True, "videoDetails": video_details, "formats": formats}
    info_cache[video_id] = {"timestamp": now, "data": payload}
    return payload


@app.post("/api/download")
async def api_download(payload: Dict[str, Any], request: Request):
    ip = client_ip(request)
    enforce_rate_limit(ip)

    url = (payload.get("url") or "").strip()
    format_id = str(payload.get("itag") or payload.get("format_id") or "").strip()
    dl_type = (payload.get("type") or "").lower().strip()

    if not url or not VALID_URL_RE.match(url):
        raise HTTPException(status_code=400, detail="Invalid YouTube URL.")
    if not format_id or dl_type not in {"audio", "video"}:
        raise HTTPException(status_code=400, detail="itag/format_id and type are required.")

    video_id = extract_video_id(url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Could not extract video ID from URL.")

    # Always reconstruct a clean video URL (removes list/index/extra params)
    clean_url = f"https://www.youtube.com/watch?v={video_id}"
    tmp_dir = tempfile.mkdtemp(prefix="ytc-")

    try:
        info, filepath = await run_in_threadpool(ytdlp_download, clean_url, format_id, tmp_dir)
    except Exception as exc:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        msg = str(exc).lower()
        if "format" in msg:
            raise HTTPException(status_code=400, detail="Requested format not available.")
        raise HTTPException(status_code=500, detail="Download failed. Please retry.")

    safe_name = sanitize_name(info.get("title") or "video")
    ext = Path(filepath).suffix
    filename = f"{safe_name}{ext}"

    media_type = "application/octet-stream"
    if dl_type == "audio":
        if ext == ".webm":
            media_type = "audio/webm"
        elif ext in {".m4a", ".mp4"}:
            media_type = "audio/mp4"
        else:
            media_type = "audio/mpeg"
    else:
        media_type = "video/mp4" if ext in {".mp4", ".m4v"} else "video/webm"

    return FileResponse(
        filepath,
        media_type=media_type,
        filename=filename,
        background=BackgroundTask(shutil.rmtree, tmp_dir, ignore_errors=True),
    )


@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": time.time()}


@app.get("/api/health")
async def api_health():
    return {"status": "ok", "timestamp": time.time()}


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


# Static assets
app.mount("/assets", StaticFiles(directory="assets"), name="assets")


@app.get("/")
async def root():
    return FileResponse("index.html")


@app.get("/{path:path}")
async def catch_all(path: str):
    if path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")
    file_path = Path(path)
    if file_path.exists() and file_path.is_file():
        return FileResponse(file_path)
    return FileResponse("index.html")
