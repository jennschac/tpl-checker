// Background service worker - handles cross-origin fetch to TPL API
// Uses long-lived ports (chrome.runtime.connect) instead of sendMessage,
// because ports keep the service worker alive until the fetch completes.

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "tpl-lookup") return;

  port.onMessage.addListener((message) => {
    if (message.type !== "TPL_LOOKUP") return;

    fetch("https://gateway.bibliocommons.com/v2/libraries/tpl/bibs/search?locale=en-CA", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        query: message.query,
        searchType: "smart",
        view: "grouped",
        filters: [{ id: "FORMAT", values: ["EBOOK"] }]
      })
    })
    .then(r => r.json())
    .then(data => port.postMessage({ ok: true, data }))
    .catch(err => port.postMessage({ ok: false, error: err.message }));
  });
});
