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
const androidSubscriptionDialog = document.getElementById("android-subscription-dialog");
const androidSubscriptionTitle = document.getElementById("android-subscription-title");
const androidSubscriptionCopyStatus = document.getElementById(
  "android-subscription-copy-status",
);
const androidSubscriptionUrl = document.getElementById("android-subscription-url");

urlInput.value = calendarUrl;
const googleLink = document.getElementById("google-cal");
googleLink.href = googleCalendarSettingsUrl;
subscribeLink.href = isAndroid ? calendarUrl : webcalUrl;
if (isAndroid) {
  subscribeLink.textContent = "Kalender hinzufügen";
  subscribeLink.title = "Hinweis zur Einrichtung mit Google Calendar auf Android";
  subscribeLink.addEventListener("click", async (event) => {
    event.preventDefault();
    const copied = await copyCalendarUrl();
    showAndroidSubscriptionHint(copied);
  });
}

function showAndroidSubscriptionHint(copied) {
  if (!androidSubscriptionDialog?.showModal) {
    copyStatus.textContent = copied
      ? "Kalender-URL kopiert. Das Google-Calendar-Abo muss einmalig am Computer unter Einstellungen → Kalender hinzufügen → Per URL eingerichtet werden."
      : `Kopieren nicht möglich. Kalender-URL: ${calendarUrl}`;
    return;
  }

  androidSubscriptionTitle.textContent = copied
    ? "Kalender-Link kopiert"
    : "Kalender-Link verwenden";
  androidSubscriptionCopyStatus.textContent = copied
    ? "Die Kalender-URL wurde in die Zwischenablage kopiert."
    : "Automatisches Kopieren war nicht möglich. Die Kalender-URL kann unten markiert und kopiert werden.";
  androidSubscriptionUrl.textContent = calendarUrl;
  if (!androidSubscriptionDialog.open) androidSubscriptionDialog.showModal();
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
