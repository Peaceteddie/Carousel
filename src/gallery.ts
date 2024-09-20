import Swiper from "swiper";
import { Navigation, Pagination, Keyboard } from "swiper/modules";
import { getState, State } from "./state";
import { generateHash } from "./utils";

let swiperInstance: Swiper | null = null;

export const createGalleryContainer = (): HTMLDivElement => {
    const existingOverlay = document.getElementById('ai-image-gallery-overlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'ai-image-gallery-overlay';
    overlay.className = 'gallery-overlay';

    const container = document.createElement('div');
    container.className = 'swiper-container';

    const wrapper = document.createElement('div');
    wrapper.className = 'swiper-wrapper';
    container.appendChild(wrapper);

    const createButton = (className: string) => {
        const button = document.createElement('div');
        button.className = className;
        container.appendChild(button);
    };

    createButton('swiper-button-prev');
    createButton('swiper-button-next');

    const pagination = document.createElement('div');
    pagination.className = 'swiper-pagination';
    container.appendChild(pagination);

    overlay.appendChild(container);
    document.body.appendChild(overlay);

    // Add click event listener to the overlay
    container.addEventListener('click', (event) => {
        if (event.target === container) {
            const state = getState();
            hideGallery(state as unknown as State);
        }
    });

    return container;
};

export const initializeSwiper = (galleryContainer: HTMLElement): Swiper | null => {
    if (swiperInstance) {
        swiperInstance.destroy(true, true);
        swiperInstance = null;
    }

    try {
        if (!galleryContainer.querySelector('.swiper-wrapper')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'swiper-wrapper';
            galleryContainer.appendChild(wrapper);
        }

        swiperInstance = new Swiper(galleryContainer, {
            modules: [Navigation, Pagination, Keyboard],
            loop: false,
            pagination: {
                el: '.swiper-pagination',
            },
            navigation: {
                nextEl: '.swiper-button-next',
                prevEl: '.swiper-button-prev',
            },
            slidesPerView: 1,
            centeredSlides: true,
            spaceBetween: 0,
            initialSlide: 0,
            keyboard: {
                enabled: true,
                onlyInViewport: false,
            },
        });

        addGalleryStyles();
        return swiperInstance;
    } catch (error) {
        console.error('Error initializing Swiper:', error);
        return null;
    }
};

const addGalleryStyles = (): void => {
    const existingStyle = document.querySelector('style#gallery-styles');
    if (existingStyle) {
        existingStyle.remove();
    }

    const style = document.createElement('style');
    style.id = 'gallery-styles';
    style.textContent = `
        #ai-image-gallery-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background-color: rgba(0, 0, 0, 0.9);
            z-index: 9999;
            display: none;
        }
        #ai-image-gallery-overlay .swiper-container {
            width: 100%;
            height: 100%;
        }
        #ai-image-gallery-overlay .swiper-slide {
            display: flex;
            align-items: center;
            justify-content: center;
        }
        #ai-image-gallery-overlay img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
        }
        #ai-image-gallery-overlay .swiper-button-prev,
        #ai-image-gallery-overlay .swiper-button-next {
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
        }
        #ai-image-gallery-overlay .swiper-pagination-bullet {
            background-color: white;
        }
    `;
    document.head.appendChild(style);
};

export const addImageToGallery = (state: State, image: { src: string, width: number, height: number }): void => {
    const imageHash = generateHash(image.src);
    if (state.dupPics.has(imageHash)) {
        return;
    }
    state.dupPics.add(imageHash);

    if (!state.galleryContainer) {
        state.galleryContainer = createGalleryContainer();
    }

    if (!state.swiper) {
        state.swiper = initializeSwiper(state.galleryContainer);
    }

    if (!state.swiper) {
        console.error('Failed to initialize Swiper instance');
        return;
    }

    try {
        const swiperSlide = document.createElement('div');
        swiperSlide.className = 'swiper-slide';
        const imgElement = document.createElement('img');
        imgElement.src = image.src;
        imgElement.style.cssText = 'max-width: 100%; max-height: 100%; object-fit: contain; width: auto; height: auto;';

        swiperSlide.appendChild(imgElement);

        state.swiper.appendSlide(swiperSlide);
        state.swiper.update();

        if (state.swiper.slides.length > 1) {
            state.swiper.params.loop = true;
            state.swiper.loopCreate();
        }

        state.swiper.updateSlides();

        if (state.dupPics.size === 1 && !state.isGalleryVisible) {
            showGallery(state);
        }
    } catch (error) {
        console.error('Error adding image to gallery:', error);
    }
};

const toggleGalleryVisibility = (state: State, visible: boolean): void => {
    const galleryOverlay = document.getElementById('ai-image-gallery-overlay');
    if (galleryOverlay) {
        galleryOverlay.style.display = visible ? 'block' : 'none';
        state.isGalleryVisible = visible;

        if (visible) {
            addGalleryEventListeners(state);
            if (!state.swiper && state.galleryContainer) {
                state.swiper = initializeSwiper(state.galleryContainer);
            }
            if (state.swiper) {
                state.swiper.update();
                state.swiper.slideTo(0, 0);
            }
        } else {
            removeGalleryEventListeners();
        }
    } else {
        console.error('Gallery overlay not found');
    }
};

export const showGallery = (state: State): void => {
    toggleGalleryVisibility(state, true);
};

export const hideGallery = (state: State): void => {
    toggleGalleryVisibility(state, false);
};

export const setGalleryVisibility = (state: State, visible: boolean): void => {
    if (!state.galleryContainer) return;

    state.isGalleryVisible = visible;
    state.galleryContainer.style.display = visible ? 'flex' : 'none';

    if (visible) {
        addGalleryEventListeners(state);
        if (state.swiper) {
            state.swiper.update();
            state.swiper.slideTo(0, 0);
        }
    } else {
        removeGalleryEventListeners();
        if (state.progressBar) {
            state.progressBar.style.display = 'none';
        }
    }
};

const addGalleryEventListeners = (state: State): void => {
    document.addEventListener('keydown', handleEscapeKey);
    document.addEventListener('keydown', handleArrowKeys);
};

const removeGalleryEventListeners = (): void => {
    document.removeEventListener('keydown', handleEscapeKey);
    document.removeEventListener('keydown', handleArrowKeys);
};

const handleEscapeKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
        const state = getState();
        hideGallery(state as unknown as State);
    }
};

const handleArrowKeys = (event: KeyboardEvent): void => {
    const state = getState();
    if (state.swiper) {
        if (event.key === 'ArrowLeft') {
            state.swiper.slidePrev();
        } else if (event.key === 'ArrowRight') {
            state.swiper.slideNext();
        }
    }
};

export const resetGallery = (state: State): void => {
    if (state.swiper) {
        state.swiper.removeAllSlides();
        state.swiper.update();
    }
    state.dupPics.clear();
};