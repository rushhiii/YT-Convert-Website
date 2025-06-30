// async function downloadVideo() {
//   const url = document.getElementById('urlInput').value;
//   if (!url) return alert("Please enter a valid YouTube URL.");

//   try {
//     // const res = await fetch("https://your-render-backend.onrender.com/download", {
//     const res = await fetch("https://<your-render-service-name>.onrender.com/api/download", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ url })
//     });

//     const data = await res.json();
//     if (data.error) {
//       alert("❌ " + data.error);
//     } else {
//       alert(`✅ Downloaded: ${data.title}\nChannel: ${data.channel_name}`);
//     }
//   } catch (err) {
//     alert("❌ Something went wrong. Try again later.");
//     console.error(err);
//   }
// }

// async function downloadVideo() {
//   const url = document.getElementById('urlInput').value;
//   if (!url) return alert("Please enter a valid YouTube URL.");

//   const format = document.getElementById("formatSelect").value;
//   if (!format || format === "Format") return alert("Please select a format.");


//   // In a real app, you'd let user pick format/audio — here's a default example
//   const body = {
//     url: url,
//     format: "18",  // Example format ID — ideally chosen by user
//     audio: false   // Set to true for MP3
//   };

//   try {
//     const res = await fetch("https://yt-convert-backend.onrender.com/api/download", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify(body)
//     });

//     if (res.ok) {
//       const blob = await res.blob();
//       const filename = res.headers.get("Content-Disposition").split("filename=")[1];
//       const url = window.URL.createObjectURL(blob);

//       const a = document.createElement("a");
//       a.href = url;
//       a.download = filename || "download";
//       a.click();
//       window.URL.revokeObjectURL(url);
//     } else {
//       const error = await res.json();
//       alert("❌ " + error.error);
//     }
//   } catch (err) {
//     alert("❌ Something went wrong. Try again later.");
//     console.error(err);
//   }
// }

const backendURL = location.hostname === "127.0.0.1" || location.hostname === "localhost"
  ? "http://127.0.0.1:5000"
  : "https://yt-convert-website.onrender.com";


async function downloadVideo() {
  const url = document.getElementById('urlInput').value;
  if (!url) return alert("Please enter a valid YouTube URL.");

  try {
    const res = await fetch(`${backendURL}/api/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        format: selectedFormat === "mp3" ? "bestaudio" : "best",
        audio: selectedFormat === "mp3"
      })
    });

    if (res.ok) {
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `video.${selectedFormat}`;
      a.click();
    } else {
      const data = await res.json();
      alert("❌ " + (data.error || "Something went wrong"));
    }
  } catch (err) {
    alert("❌ Could not connect to the server.");
    console.error(err);
  }
}


let selectedURL = "";
let formatList = [];

async function fetchFormats() {
  const url = document.getElementById('urlInput').value;
  if (!url) return alert("Please enter a valid YouTube URL.");
  selectedURL = url;

  document.body.classList.add("loading");

  try {
    const res = await fetch(`${backendURL}/api/info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });

    const data = await res.json();
    document.body.classList.remove("loading");

    if (data.error) return alert("❌ " + data.error);

    formatList = data.formats;
    populateFormatDropdown(data.formats);
    document.getElementById("formatWrapper").style.display = "block";
  } catch (err) {
    document.body.classList.remove("loading");
    alert("❌ Failed to fetch formats");
    console.error(err);
  }
}

function populateFormatDropdown(formats) {
  const select = document.getElementById("formatSelect");
  select.innerHTML = "";

  formats.forEach(f => {
    const opt = document.createElement("option");
    opt.value = f.format_id;
    opt.textContent = `${f.audio_only ? "Audio" : "Video"} - ${f.ext.toUpperCase()} ${f.res || ""} ${f.note || ""}`;
    select.appendChild(opt);
  });

  document.getElementById("downloadBtn").style.display = "inline-block";
}

async function downloadSelectedFormat() {
  const format = document.getElementById("formatSelect").value;
  const selected = formatList.find(f => f.format_id === format);
  const isAudio = selected.audio_only;

  document.body.classList.add("loading");
// https://yt-convert-website.onrender.com
  try {
    const res = await fetch(`${backendURL}/api/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: selectedURL, format, audio: isAudio })
    });

    if (!res.ok) {
      const errData = await res.json();
      alert("❌ " + errData.error);
      return;
    }

    // Create temporary download link
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `yt_convert.${isAudio ? "mp3" : "mp4"}`;
    a.click();
  } catch (err) {
    alert("❌ Download failed");
    console.error(err);
  } finally {
    document.body.classList.remove("loading");
  }
}


let selectedFormat = "mp3"; // default

document.querySelectorAll(".format-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".format-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedFormat = btn.getAttribute("data-format");
  });
});


// ========================================================== others

document.getElementById('year').textContent = new Date().getFullYear();

window.addEventListener('scroll', function () {
  const header = document.querySelector('header');
  if (!header) return;
  if (window.scrollY > 60) {
    header.classList.add('scrolled');
  } else {
    header.classList.remove('scrolled');
  }
});

const scrollBtn = document.getElementById('scrollTopButton');
window.addEventListener('scroll', () => {
  if (window.scrollY > 200) {
    scrollBtn.classList.add('visible');
  } else {
    scrollBtn.classList.remove('visible');
  }
});
scrollBtn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });

const hamburgerBtn = document.getElementById('hamburgerBtn');
const mainNav = document.getElementById('mainNav');

if (hamburgerBtn && mainNav) {
  hamburgerBtn.addEventListener('click', () => {
    hamburgerBtn.classList.toggle('active');
    mainNav.classList.toggle('open');
  });

  // Optional: close menu when clicking a link
  mainNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      hamburgerBtn.classList.remove('active');
      mainNav.classList.remove('open');
    });
  });
}

function checkScrollButtonFooterOverlap() {
  const scrollBtn = document.getElementById('scrollTopButton');
  const footer = document.querySelector('.custom-footer');
  if (!scrollBtn || !footer) return;

  const btnRect = scrollBtn.getBoundingClientRect();
  const footerRect = footer.getBoundingClientRect();

  // Check if the button's bottom is below the footer's top
  // if (btnRect.bottom-50 >= footerRect.top) {
  if (btnRect.bottom >= footerRect.top - 10) {
    scrollBtn.classList.add('footer-overlap');
  } else {
    scrollBtn.classList.remove('footer-overlap');
  }

  if (btnRect.bottom - 30 >= footerRect.top) {
    scrollBtn.classList.add('footer-overlap-stroke');
  } else {
    scrollBtn.classList.remove('footer-overlap-stroke');
  }
}

window.addEventListener('scroll', checkScrollButtonFooterOverlap);
window.addEventListener('resize', checkScrollButtonFooterOverlap);

