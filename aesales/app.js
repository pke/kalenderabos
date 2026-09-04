const calendarUrl = "https://kalenderabos.de/aesales.ics";
const webcalUrl = calendarUrl.replace(/^https?:/, "webcal:");
const googleCalendarSettingsUrl =
  "https://calendar.google.com/calendar/u/0/r/settings/addbyurl";
const isAndroid = navigator.userAgentData?.platform === "Android" ||
  /Android/i.test(navigator.userAgent);
const urlInput = document.getElementById("cal-url");
const copyButton = document.getElementById("copy-button");
const copyStatus = document.getElementById("copy-status");
const subscribeLink = document.getElementById("webcal-link");

urlInput.value = calendarUrl;
const googleLink = document.getElementById("google-cal");
googleLink.href = googleCalendarSettingsUrl;
subscribeLink.href = isAndroid ? calendarUrl : webcalUrl;
if (isAndroid) {
  subscribeLink.textContent = "Auf Android einrichten";
  subscribeLink.title = "Kalender-URL kopieren und Einrichtung anzeigen";
  subscribeLink.addEventListener("click", async (event) => {
    event.preventDefault();
    const copied = await copyCalendarUrl();
    copyStatus.textContent = copied
      ? "Google Calendar kann URL-Abos nicht in der Android-App hinzufügen. Die URL ist kopiert; am Computer unter Einstellungen → Kalender hinzufügen → Per URL einfügen."
      : `Kopieren nicht möglich. Kalender-URL: ${calendarUrl}`;
  });
}

async function copyCalendarUrl(showConfirmation = false) {
  let copied = true;
  try {
    await navigator.clipboard.writeText(calendarUrl);
  } catch {
    urlInput.select();
    copied = document.execCommand("copy");
    urlInput.setSelectionRange(0, 0);
  }
  if (showConfirmation) {
    copyStatus.textContent = copied
      ? "Kalender-URL wurde kopiert."
      : `Kopieren nicht möglich. Kalender-URL: ${calendarUrl}`;
  }
  return copied;
}

googleLink.addEventListener("click", async () => {
  const copied = await copyCalendarUrl();
  copyStatus.textContent = copied
    ? "Kalender-URL kopiert. In Google Calendar unter „Per URL“ einfügen."
    : `Kopieren nicht möglich. Kalender-URL: ${calendarUrl}`;
});

copyButton.addEventListener("click", async () => {
  await copyCalendarUrl(true);
  copyButton.textContent = "Kopiert";
  window.setTimeout(() => {
    copyButton.textContent = "Link kopieren";
    copyStatus.textContent = "";
  }, 2000);
});
