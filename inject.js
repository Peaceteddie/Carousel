var checked = [];

let galleryElement = document.createElement("div");
galleryElement.setAttribute("class", "gallery-carousel");

document.body.appendChild(galleryElement);

let gallery = document.querySelector(".gallery-carousel");
checked.forEach((element) => gallery.append(element));

var imgs = document.querySelectorAll("img").forEach((element) => {
	let attr = element.getAttribute("srcset");

	if (attr) {
		let lastsize = attr.split(",").slice(-1)[0].split(" ");
		if (lastsize) {
			let src = lastsize.length > 2 ? lastsize[1] : lastsize[0];
			let image = document.createElement("img");

			image.id = checked.length;
			image.src = src;
			image.onload = () => {
				if (image.naturalWidth > 500 || image.naturalHeight > 500) {
					gallery.appendChild(image);
				}
			};
		}
	}
});
