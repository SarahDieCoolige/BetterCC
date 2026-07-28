// ─── Chat iframe: autoscroll banner ───

export function addAutoscrollBanner(iframeDoc: Document, iframeWin: Window): void {
  if (!iframeDoc || !iframeWin) return;

  const scrollbanner = iframeDoc.createElement("div");
  scrollbanner.id = "autoscroll-banner";
  scrollbanner.textContent = "Zurück nach unten";
  iframeDoc.body.appendChild(scrollbanner);

  scrollbanner.addEventListener("click", function () {
    (iframeWin as any).scrolling = true;
    scrollbanner.style.display = "none";
  });

  let lastScrollTop =
    iframeWin.scrollY || iframeDoc.documentElement.scrollTop;

  iframeWin.addEventListener("scroll", function () {
    const scrollPosition =
      iframeDoc.documentElement.scrollTop || iframeDoc.body.scrollTop;
    const maxScroll =
      iframeDoc.body.scrollHeight - iframeWin.innerHeight;

    if (scrollPosition < lastScrollTop) {
      if ((iframeWin as any).scrolling && scrollPosition < maxScroll - 1) {
        (iframeWin as any).scrolling = false;
        scrollbanner.style.display = "block";
      }
    }

    if (scrollPosition >= maxScroll - 1) {
      scrollbanner.style.display = "none";
      (iframeWin as any).scrolling = true;
    }

    lastScrollTop = scrollPosition <= 0 ? 0 : scrollPosition;
  });
}
