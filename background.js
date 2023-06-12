function Main(refetch = false) {
  let previous = document.querySelector(".swiper");

  previous
    ? refetch
      ? previous.remove()
      : (previous.style.visibility = "visible")
    : null;

  var loaded = 0;
  var loading = 0;
  var checked = [];
  var dupPics = [];
  var dupLinks = [];
  var rejected = 0;

  document.querySelectorAll("img").forEach((element) => {
    if (GetParents(element, "nav").length > 0) return;
    let parentLinks = GetParents(element, "a");

    if (parentLinks.length > 0) {
      if (!dupLinks.includes(parentLinks[0])) {
        dupLinks.push(parentLinks[0]);

        let parentLink = parentLinks[0].getAttribute("href");

        let sameSrc = parentLink.includes(window.location.href);

        let relative = parentLink[0] === "/" && parentLink[1] !== "/";

        let CDNLink = parentLink.includes("cdn");

        if (
          (sameSrc || relative) &&
          document.location.pathname.split("/").length >
            (relative
              ? parentLink.split("/").length
              : new URL(parentLink).pathname.split("/").length)
        )
          return;

        if (sameSrc || relative)
          fetch(parentLink)
            .then((response) => {
              response
                .text()
                .then((string) =>
                  new DOMParser().parseFromString(string, "text/html")
                )
                .then((doc) => {
                  doc.querySelectorAll("img").forEach((innerElement) => {
                    let srcset = innerElement.getAttribute("srcset");
                    if (srcset) FetchImages(srcset);
                    else FetchImage(innerElement);
                  });
                });
            })
            .catch((e) => console.log(e, parentLink));
        else if (CDNLink) MakeImage(parentLink);
      }
    }

    let srcset = element.getAttribute("srcset");
    if (srcset) FetchImages(srcset);
    else FetchImage(element);
  });

  let setInt = setInterval(() => {
    if (loading > loaded) return;
    console.log("loaded: ", loaded, ", rejected: ", rejected);
    clearInterval(setInt);
    Instantiate();
  }, 1000);

  function GetParents(elem, selector) {
    if (!Element.prototype.matches) {
      Element.prototype.matches =
        Element.prototype.matchesSelector ||
        Element.prototype.mozMatchesSelector ||
        Element.prototype.msMatchesSelector ||
        Element.prototype.oMatchesSelector ||
        function (s) {
          var matches = (this.document || this.ownerDocument).querySelectorAll(
              s
            ),
            i = matches.length;
          while (--i >= 0 && matches.item(i) !== this) {}
          return i > -1;
        };
    }

    // Set up a parent array
    var parents = [];

    // Push each parent element to the array
    for (; elem && elem !== document; elem = elem.parentNode) {
      if (selector) {
        if (elem.matches(selector)) {
          parents.push(elem);
        }
        continue;
      }
      parents.push(elem);
    }

    // Return our parent array
    return parents;
  }

  function FetchImages(srcset) {
    let lastsize;
    lastsize = srcset.split(",");
    lastsize = lastsize.slice(-1);
    lastsize = lastsize[0].split(" ");

    if (lastsize) {
      let src = lastsize.length > 2 ? lastsize[1] : lastsize[0];
      MakeImage(src);
    }
  }

  function FetchImage(element) {
    let src = element.getAttribute("src");
    MakeImage(src);
  }

  function MakeImage(src) {
    if (!src || dupPics.includes(src)) return;
    dupPics.push(src);

    let lowSrc = src.toLowerCase();
    if (checkIncludes(lowSrc)) return;

    let image = document.createElement("img");
    image.setAttribute("class", "swiper-slide");
    image.style.objectFit = "contain";
    image.src = src;
    loading++;

    image.onabort =
      image.onerror =
      image.oncancel =
        () => {
          loaded++;
          rejected++;
        };
    image.onload = () => {
      loaded++;
      if (image.naturalWidth > 500 || image.naturalHeight > 500)
        checked.push(image);
      else rejected++;
    };

    function checkIncludes(src) {
      let isIncluded = false;
      let exclude = ["icon", "avatar", "blur"];
      exclude.forEach((word) => {
        if (src.includes(word)) isIncluded = true;
      });
      return isIncluded;
    }
  }

  function Instantiate() {
    let swiperElement = document.createElement("div");
    swiperElement.setAttribute("class", "swiper");
    swiperElement.style.position = "absolute";
    swiperElement.style.height = "100svh";
    swiperElement.style.width = "92svw";
    swiperElement.style.zIndex = "100";
    swiperElement.style.inset = "0";

    let swiperWrapper = document.createElement("div");
    swiperWrapper.setAttribute("class", "swiper-wrapper");
    swiperWrapper.addEventListener(
      "click",
      () => (swiperElement.style.visibility = "hidden")
    );

    let swiperPagination = document.createElement("div");
    swiperPagination.setAttribute("class", "swiper-pagination");

    let swiperPrev = document.createElement("div");
    swiperPrev.setAttribute("class", "swiper-button-prev");
    swiperPrev.addEventListener("click", () =>
      swiperElement.swiper.slidePrev()
    );

    let swiperNext = document.createElement("div");
    swiperNext.setAttribute("class", "swiper-button-next");
    swiperNext.addEventListener("click", () =>
      swiperElement.swiper.slideNext()
    );

    let swiperScrollbar = document.createElement("div");
    swiperScrollbar.setAttribute("class", "swiper-scrollbar");
    swiperScrollbar.style.height = "20px";

    swiperElement.appendChild(swiperWrapper);
    swiperElement.appendChild(swiperPagination);
    swiperElement.appendChild(swiperPrev);
    swiperElement.appendChild(swiperNext);
    swiperElement.appendChild(swiperScrollbar);

    document.body.appendChild(swiperElement);

    checked.forEach((e) => swiperWrapper.appendChild(e));

    let swiper = new Swiper(".swiper", {
      // Optional parameters
      direction: "horizontal",
      loop: true,

      // If we need pagination
      pagination: {
        el: ".swiper-pagination",
        type: "fraction",
      },

      // Navigation arrows
      navigation: {
        nextEl: ".swiper-button-next",
        prevEl: ".swiper-button-prev",
      },

      // Scrollbar
      scrollbar: {
        el: ".swiper-scrollbar",
        draggable: true,
      },
    });
  }
}

chrome.contextMenus.create({
  id: "420",
  title: "Fetch and show",
  contexts: ["page"],
});

chrome.contextMenus.create({
  id: "421",
  title: "Show / Hide",
  contexts: ["page"],
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "420")
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: Main,
      args: [true],
    });
  else
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: Main,
    });
});

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: Main,
  });
});
