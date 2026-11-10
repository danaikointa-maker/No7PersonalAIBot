// Transparent companion avatar — drag with the window (Electron overlay) or mouse (browser).
import { EyeAvatar } from './ui/avatar.js';

const canvas = document.getElementById('avatar');
const bubble = document.getElementById('bubble');
const avatar = new EyeAvatar(canvas);
avatar.setEmotion('happy');
avatar.start();

// Browser fallback: click cycles emotions so the overlay page is testable standalone.
let i = 0;
const emotions = ['happy', 'listening', 'thinking', 'speaking', 'love', 'sleepy'];
window.addEventListener('click', () => {
  avatar.setEmotion(emotions[i++ % emotions.length]);
});

const bridge = globalThis.no7?.native;
if (bridge?.onSubtitle) {
  bridge.onSubtitle((text) => {
    bubble.textContent = text;
    bubble.style.display = text ? 'block' : 'none';
    if (text) setTimeout(() => { bubble.style.display = 'none'; }, 6000);
  });
}
if (bridge?.onEmotion) {
  bridge.onEmotion((emotion) => avatar.setEmotion(emotion));
}
