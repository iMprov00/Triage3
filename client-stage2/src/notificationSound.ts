import { markArrivalSoundPlayed, wasArrivalSoundPlayed } from "./arrivalNotificationStore";

const NOTIFICATION_SRC = "/sounds/notification.mp3";
const NOTIFICATION_VOLUME = 0.85;

let unlocked = false;
let audio: HTMLAudioElement | null = null;
let pendingPlays = 0;

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(NOTIFICATION_SRC);
    audio.preload = "auto";
    audio.volume = NOTIFICATION_VOLUME;
  }
  return audio;
}

function playNow(): void {
  try {
    const el = getAudio();
    if (!el.paused) {
      const clone = el.cloneNode(true) as HTMLAudioElement;
      clone.volume = NOTIFICATION_VOLUME;
      void clone.play();
      return;
    }
    el.currentTime = 0;
    el.volume = NOTIFICATION_VOLUME;
    void el.play();
  } catch {
    /* ignore */
  }
}

function flushPendingPlays(): void {
  if (pendingPlays <= 0) return;
  const count = pendingPlays;
  pendingPlays = 0;
  for (let i = 0; i < count; i += 1) {
    playNow();
  }
}

function markUnlocked(): void {
  if (unlocked) return;
  unlocked = true;
  flushPendingPlays();
}

/**
 * Разблокировать звук. Важно: вызывать синхронно из обработчика клика/нажатия —
 * иначе браузер заблокирует autoplay.
 */
export function unlockNotificationAudio(): void {
  if (unlocked) return;
  try {
    const el = getAudio();
    const prevVolume = el.volume;
    el.volume = 0.001;
    const playPromise = el.play();
    if (!playPromise) {
      el.volume = prevVolume;
      markUnlocked();
      return;
    }
    void playPromise
      .then(() => {
        el.pause();
        el.currentTime = 0;
        el.volume = prevVolume;
        markUnlocked();
      })
      .catch(() => {
        el.volume = prevVolume;
      });
  } catch {
    /* ждём следующего жеста пользователя */
  }
}

/** Звук при поступлении пациента на этап 2 (ожидает приёма). */
export function playArrivalSound(): void {
  if (!unlocked) {
    pendingPlays += 1;
    return;
  }
  playNow();
}

/**
 * Звук для конкретного пациента — не чаще одного раза на этом устройстве.
 * @returns true, если уведомление новое для устройства и звук поставлен в очередь/проигран.
 */
export function playArrivalSoundForPatient(patientId: number): boolean {
  if (wasArrivalSoundPlayed(patientId)) return false;
  markArrivalSoundPlayed(patientId);
  playArrivalSound();
  return true;
}
