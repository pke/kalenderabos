const calendarUrl = "https://kalenderabos.de/aesales.ics";
const webcalUrl = calendarUrl.replace(/^https?:/, "webcal:");
const googleCalendarUrl =
  "https://calendar.google.com/calendar/r?cid=" + encodeURIComponent(calendarUrl);
const isAndroid = navigator.userAgentData?.platform === "Android" ||
  /Android/i.test(navigator.userAgent);
const urlInput = document.getElementById("cal-url");
const copyButton = document.getElementById("copy-button");
const copyStatus = document.getElementById("copy-status");
const subscribeLink = document.getElementById("webcal-link");

urlInput.value = calendarUrl;
document.getElementById("google-cal").href = googleCalendarUrl;
subscribeLink.href = isAndroid ? googleCalendarUrl : webcalUrl;
if (isAndroid) {
  subscribeLink.target = "_blank";
  subscribeLink.rel = "noopener";
  subscribeLink.title = "In Google Calendar abonnieren";
  subscribeLink.addEventListener("click", () => {
    copyStatus.textContent =
      "Anschließend in Google Calendar unter Einstellungen den Kalender synchronisieren und einblenden.";
  });
}

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
