const calendarUrl = "https://kalenderabos.de/aesales.ics";
const webcalUrl = calendarUrl.replace(/^https?:/, "webcal:");
const urlInput = document.getElementById("cal-url");
const copyButton = document.getElementById("copy-button");
const copyStatus = document.getElementById("copy-status");

urlInput.value = calendarUrl;
document.getElementById("google-cal").href =
  "https://calendar.google.com/calendar/r?cid=" + encodeURIComponent(webcalUrl);
document.getElementById("webcal-link").href = webcalUrl;

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(calendarUrl);
  } catch {
    urlInput.select();
    document.execCommand("copy");
    urlInput.setSelectionRange(0, 0);
  }
  copyButton.textContent = "Kopiert";
  copyStatus.textContent = "Kalender-URL wurde kopiert.";
  window.setTimeout(() => {
    copyButton.textContent = "Link kopieren";
    copyStatus.textContent = "";
  }, 2000);
});
