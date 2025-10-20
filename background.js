// Script to handle background tasks
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'readAloud') {
    chrome.tts.speak(message.text);
  }
});
