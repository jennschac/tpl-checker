// TPL Checker - Content Script
// Runs on goodreads.com/blog/show/* pages

const TPL_RECORD_BASE = "https://tpl.bibliocommons.com/v2/record/";
const REQUEST_DELAY = 400;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Use a long-lived port to the background worker so the service worker
// stays alive until the fetch completes (avoids MV3 "channel closed" errors).
async function lookupTPL(title, author) {
  // Normalize curly/smart apostrophes and quotes to their ASCII equivalents
  // so TPL's search index can match them reliably.
  const normalize = s => s.replace(/[\u2018\u2019\u201A\u201B]/g, "'")
                          .replace(/[\u201C\u201D\u201E\u201F]/g, '"');
  const query = author
    ? `${normalize(title)} ${normalize(author)}`
    : normalize(title);

  return new Promise((resolve) => {
    let port;
    try {
      port = chrome.runtime.connect({ name: "tpl-lookup" });
    } catch (err) {
      console.warn("[TPL Checker] Could not connect to background:", err.message);
      resolve(null);
      return;
    }

    port.onMessage.addListener((response) => {
      port.disconnect();
      if (!response.ok) {
        console.warn("[TPL Checker] Bad response for:", title, response.error);
        resolve(null);
        return;
      }

      const data = response.data;
      const results = data.catalogSearch?.results;
      if (!results || results.length === 0) {
        resolve({ found: false });
        return;
      }

      // The representative of the first result may be a physical copy.
      // Search all returned bibs for the ebook specifically.
      const bibs = data.entities?.bibs;
      const ebookBib = Object.values(bibs || {}).find(
        bib => bib.briefInfo?.format === "EBOOK"
      );

      if (!ebookBib) {
        resolve({ found: false });
        return;
      }

      resolve({ found: true, bibId: ebookBib.id, availability: ebookBib.availability || null });
    });

    port.onDisconnect.addListener(() => {
      if (chrome.runtime.lastError) {
        console.warn("[TPL Checker] Port disconnected:", chrome.runtime.lastError.message);
      }
      resolve(null);
    });

    port.postMessage({ type: "TPL_LOOKUP", query });
  });
}

function makeBadge(result, bibId) {
  const badge = document.createElement("a");
  badge.className = "tpl-badge";
  badge.target = "_blank";
  badge.rel = "noopener noreferrer";
  badge.href = bibId ? `${TPL_RECORD_BASE}${bibId}` : "https://tpl.bibliocommons.com/";

  if (!result) {
    badge.classList.add("tpl-not-found");
    badge.textContent = "eBook: error";
    return badge;
  }

  if (!result.found) {
    badge.classList.add("tpl-not-found");
    badge.textContent = "eBook: not at TPL";
    return badge;
  }

  const avail = result.availability;

  if (!avail) {
    badge.classList.add("tpl-available");
    badge.textContent = "eBook ✓";
    return badge;
  }

  const statusType = avail.statusType || avail.status || "";
  const available = avail.availableCopies ?? 0;

  if (statusType === "AVAILABLE" || available > 0) {
    badge.classList.add("tpl-available");
    badge.textContent = "eBook ✓ available";
  } else {
    badge.classList.add("tpl-unavailable");
    badge.textContent = "eBook: on hold";
  }

  return badge;
}

function findBookElements() {
  // Two layouts exist on /blog/show/* pages:
  //
  // 1. Editorial ("Can't Wait to Read") — book title is text inside div.bookTitle
  // 2. Challenge/list ("Most Read") — books shown as cover images only;
  //    title is in img[alt], no text content on the link
  //
  // Try layout 1 first. If no div.bookTitle links exist, fall back to layout 2.

  const seen = new Set();
  const unique = [];

  // Layout 1: editorial pages
  const bookTitleLinks = document.querySelectorAll('div.bookTitle a[href*="/book/show/"]');
  if (bookTitleLinks.length > 0) {
    for (const link of bookTitleLinks) {
      if (!link.textContent.trim()) continue;
      const href = link.getAttribute("href");
      if (seen.has(href)) continue;
      seen.add(href);
      unique.push(link);
    }
    return unique;
  }

  // Layout 2: challenge/list pages — find cover image links that have an alt title
  for (const img of document.querySelectorAll('a[href*="/book/show/"] img[alt]')) {
    const link = img.closest('a');
    if (!link || !img.alt) continue;
    const href = link.getAttribute("href");
    if (seen.has(href)) continue;
    seen.add(href);
    unique.push(link);
  }

  return unique;
}

function extractBookInfo(linkEl) {
  // Layout 1: editorial — title from link text, author from sibling author link
  const bookTitleDiv = linkEl.closest("div.bookTitle");
  if (bookTitleDiv) {
    const title = linkEl.textContent.trim();
    const authorLink = bookTitleDiv.querySelector('a[href*="/author/show/"]');
    return { title, author: authorLink ? authorLink.textContent.trim() : null };
  }

  // Layout 2: challenge/list — title from cover img alt, no author in page HTML
  const img = linkEl.querySelector('img[alt]');
  if (img?.alt) {
    return { title: img.alt, author: null };
  }

  return { title: linkEl.textContent.trim(), author: null };
}

async function run() {
  const bookLinks = findBookElements();

  if (bookLinks.length === 0) {
    console.log("[TPL Checker] No books found (tried div.bookTitle and img[alt] layouts). Open DevTools to debug.");
    const all = document.querySelectorAll('a[href*="/book/show/"]');
    console.log(`[TPL Checker] Total /book/show/ links on page: ${all.length}`);
    all.forEach(l => {
      const layout = l.closest("div.bookTitle") ? "[bookTitle]" : l.querySelector("img[alt]") ? "[img-alt]" : "[other]";
      console.log(" -", layout, l.textContent.trim() || l.querySelector("img")?.alt || "[no title]");
    });
    return;
  }

  console.log(`[TPL Checker] Found ${bookLinks.length} books. Checking TPL eBook availability...`);

  for (let i = 0; i < bookLinks.length; i++) {
    const linkEl = bookLinks[i];

    const loadingBadge = document.createElement("span");
    loadingBadge.className = "tpl-badge tpl-loading";
    loadingBadge.textContent = "eBook…";
    linkEl.insertAdjacentElement("afterend", loadingBadge);

    if (i > 0) await sleep(REQUEST_DELAY);

    const { title, author } = extractBookInfo(linkEl);
    console.log(`[TPL Checker] Looking up: "${title}"${author ? ` by ${author}` : ""}`);

    const result = await lookupTPL(title, author);
    const realBadge = makeBadge(result, result?.bibId || null);
    loadingBadge.replaceWith(realBadge);
  }

  console.log("[TPL Checker] Done!");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run);
} else {
  run();
}
