# yt_converter_backend/app.py

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import yt_dlp
import os
import uuid
import json
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, APIC, TIT2, TPE1, TALB, TDRC, COMM
from mutagen.mp4 import MP4, MP4Cover
import requests
from io import BytesIO

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes
DOWNLOAD_DIR = "downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

@app.route("/api/info", methods=["POST"])
def get_info():
    url = request.json.get("url")
    if not url:
        return jsonify({"error": "Missing URL"}), 400

    ydl_opts = {
        "quiet": True,
        "skip_download": True,
        "forcejson": True,
        "simulate": True
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # Extract comprehensive metadata
            metadata = {
                "title": info.get("title"),
                "uploader": info.get("uploader") or info.get("channel"),
                "uploader_id": info.get("uploader_id") or info.get("channel_id"),
                "duration": info.get("duration"),
                "view_count": info.get("view_count"),
                "like_count": info.get("like_count"),
                "upload_date": info.get("upload_date"),
                "description": info.get("description", "")[:500] + "..." if info.get("description") and len(info.get("description")) > 500 else info.get("description"),
                "thumbnail": info.get("thumbnail"),
                "webpage_url": info.get("webpage_url"),
                "tags": info.get("tags", []),
                "categories": info.get("categories", [])
            }
            
            # Process available formats
            formats = []
            seen_formats = set()
            
            for f in info.get("formats", []):
                if not f.get("format_id"):
                    continue
                    
                format_key = (f.get("ext"), f.get("height"), f.get("vcodec"), f.get("acodec"))
                if format_key in seen_formats:
                    continue
                seen_formats.add(format_key)
                
                # Determine if it's audio-only
                is_audio_only = f.get("vcodec") == "none" or f.get("resolution") == "audio only"
                
                # Get quality info
                quality = "Unknown"
                if is_audio_only:
                    if f.get("abr"):
                        quality = f"{f.get('abr')}kbps"
                else:
                    if f.get("height"):
                        quality = f"{f.get('height')}p"
                    elif f.get("resolution"):
                        quality = f.get("resolution")
                
                formats.append({
                    "format_id": f["format_id"],
                    "ext": f.get("ext", "unknown"),
                    "quality": quality,
                    "resolution": f.get("height"),
                    "fps": f.get("fps"),
                    "filesize": f.get("filesize"),
                    "audio_bitrate": f.get("abr"),
                    "video_codec": f.get("vcodec"),
                    "audio_codec": f.get("acodec"),
                    "format_note": f.get("format_note", ""),
                    "audio_only": is_audio_only,
                    "has_video": f.get("vcodec") != "none",
                    "has_audio": f.get("acodec") != "none"
                })
            
            # Sort formats: audio-only first, then by resolution (highest first)
            formats.sort(key=lambda x: (
                not x["audio_only"],  # Audio-only formats first
                -(x["resolution"] or 0),  # Higher resolution first
                -(x["audio_bitrate"] or 0)  # Higher bitrate first
            ))
            
            return jsonify({
                "metadata": metadata,
                "formats": formats[:50]  # Limit to 50 formats to avoid overwhelming UI
            })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def download_thumbnail(url):
    """Download thumbnail image and return as bytes"""
    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            return response.content
    except:
        pass
    return None

def embed_metadata_mp3(filepath, metadata, thumbnail_data=None):
    """Embed metadata into MP3 file"""
    try:
        audio = MP3(filepath, ID3=ID3)
        
        # Add ID3 tag if it doesn't exist
        if audio.tags is None:
            audio.add_tags()
        
        # Add metadata
        if metadata.get("title"):
            audio.tags.add(TIT2(encoding=3, text=metadata["title"]))
        if metadata.get("uploader"):
            audio.tags.add(TPE1(encoding=3, text=metadata["uploader"]))
        if metadata.get("upload_date"):
            audio.tags.add(TDRC(encoding=3, text=metadata["upload_date"][:4]))
        if metadata.get("description"):
            audio.tags.add(COMM(encoding=3, lang="eng", desc="Description", text=metadata["description"]))
        
        # Add thumbnail
        if thumbnail_data:
            audio.tags.add(APIC(
                encoding=3,
                mime='image/jpeg',
                type=3,  # Cover (front)
                desc='Cover',
                data=thumbnail_data
            ))
        
        audio.save()
    except Exception as e:
        print(f"Failed to embed MP3 metadata: {e}")

def embed_metadata_mp4(filepath, metadata, thumbnail_data=None):
    """Embed metadata into MP4 file"""
    try:
        video = MP4(filepath)
        
        if metadata.get("title"):
            video["\xa9nam"] = metadata["title"]
        if metadata.get("uploader"):
            video["\xa9ART"] = metadata["uploader"]
        if metadata.get("upload_date"):
            video["\xa9day"] = metadata["upload_date"][:4]
        if metadata.get("description"):
            video["\xa9cmt"] = metadata["description"]
        
        # Add thumbnail
        if thumbnail_data:
            video["covr"] = [MP4Cover(thumbnail_data, MP4Cover.FORMAT_JPEG)]
        
        video.save()
    except Exception as e:
        print(f"Failed to embed MP4 metadata: {e}")

@app.route("/api/download", methods=["POST"])
def download():
    url = request.json.get("url")
    format_id = request.json.get("format")
    audio_only = request.json.get("audio", False)

    if not url:
        return jsonify({"error": "Missing URL"}), 400

    # Generate unique filename
    unique_id = str(uuid.uuid4())[:8]
    ext = "mp3" if audio_only else "mp4"
    temp_filename = f"temp_{unique_id}.%(ext)s"
    temp_filepath = os.path.join(DOWNLOAD_DIR, temp_filename)
    
    final_filename = f"yt_video_{unique_id}.{ext}"
    final_filepath = os.path.join(DOWNLOAD_DIR, final_filename)

    ydl_opts = {
        "format": format_id if format_id else ("bestaudio" if audio_only else "best"),
        "outtmpl": temp_filepath,
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "192"
        }] if audio_only else [],
        "writethumbnail": False,  # We'll handle thumbnails separately
        "writeinfojson": False
    }

    try:
        # First, get metadata
        info_opts = {
            "quiet": True,
            "skip_download": True,
            "forcejson": True,
            "simulate": True
        }
        
        metadata = {}
        thumbnail_data = None
        
        with yt_dlp.YoutubeDL(info_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            metadata = {
                "title": info.get("title"),
                "uploader": info.get("uploader") or info.get("channel"),
                "upload_date": info.get("upload_date"),
                "description": info.get("description", "")[:500] + "..." if info.get("description") and len(info.get("description")) > 500 else info.get("description"),
                "webpage_url": info.get("webpage_url")
            }
            
            # Download thumbnail
            if info.get("thumbnail"):
                thumbnail_data = download_thumbnail(info.get("thumbnail"))

        # Download the video/audio
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        
        # Find the actual downloaded file (yt-dlp might change the extension)
        downloaded_files = [f for f in os.listdir(DOWNLOAD_DIR) if f.startswith(f"temp_{unique_id}")]
        if not downloaded_files:
            return jsonify({"error": "Download failed - no file created"}), 500
        
        actual_temp_file = os.path.join(DOWNLOAD_DIR, downloaded_files[0])
        
        # Rename to final filename
        os.rename(actual_temp_file, final_filepath)
        
        # Embed metadata
        if audio_only:
            embed_metadata_mp3(final_filepath, metadata, thumbnail_data)
        else:
            embed_metadata_mp4(final_filepath, metadata, thumbnail_data)
        
        # Generate a clean filename for download
        clean_title = "".join(c for c in (metadata.get("title", "video") or "video") if c.isalnum() or c in (' ', '-', '_')).strip()[:50]
        download_filename = f"{clean_title}.{ext}"
        
        return send_file(
            final_filepath, 
            as_attachment=True, 
            download_name=download_filename,
            mimetype="audio/mpeg" if audio_only else "video/mp4"
        )
        
    except Exception as e:
        # Cleanup any partial files
        for f in os.listdir(DOWNLOAD_DIR):
            if unique_id in f:
                try:
                    os.remove(os.path.join(DOWNLOAD_DIR, f))
                except:
                    pass
        return jsonify({"error": str(e)}), 500

    finally:
        # Cleanup downloaded file after sending
        try:
            if os.path.exists(final_filepath):
                os.remove(final_filepath)
        except:
            pass

@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({"status": "OK", "message": "YT Convert API is running"})

# Cleanup old files periodically
@app.route("/api/cleanup", methods=["POST"])
def cleanup_old_files():
    """Clean up old download files"""
    try:
        import time
        current_time = time.time()
        cleaned = 0
        
        for filename in os.listdir(DOWNLOAD_DIR):
            filepath = os.path.join(DOWNLOAD_DIR, filename)
            file_age = current_time - os.path.getctime(filepath)
            
            # Remove files older than 1 hour
            if file_age > 3600:
                os.remove(filepath)
                cleaned += 1
                
        return jsonify({"cleaned": cleaned})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    # Use the PORT environment variable provided by Render
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
