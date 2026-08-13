/**
 * Ambil suhu & kelembapan sebenarnya di lokasi pengguna sebagai titik awal
 * perhitungan kecepatan suara.
 *
 * Memakai Open-Meteo: gratis, tanpa API key, mendukung CORS. Bila lokasi
 * ditolak atau jaringan mati, pemanggil cukup membiarkan nilai manual —
 * aplikasi tidak boleh gagal hanya karena cuaca tidak terbaca.
 */

export interface WeatherReading {
  temperature: number; // °C
  humidity: number; // %
  latitude: number;
  longitude: number;
}

const GEO_TIMEOUT_MS = 8000;
const FETCH_TIMEOUT_MS = 8000;

function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Perangkat tidak mendukung geolokasi.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: GEO_TIMEOUT_MS,
      maximumAge: 15 * 60 * 1000, // posisi 15 menit terakhir sudah cukup akurat
      enableHighAccuracy: false,
    });
  });
}

export async function fetchWeatherAt(latitude: number, longitude: number): Promise<WeatherReading> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(4)}` +
    `&longitude=${longitude.toFixed(4)}&current=temperature_2m,relative_humidity_2m`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Layanan cuaca menjawab ${response.status}.`);
    const json = await response.json();
    const temperature = Number(json?.current?.temperature_2m);
    const humidity = Number(json?.current?.relative_humidity_2m);
    if (!Number.isFinite(temperature)) throw new Error('Data suhu tidak lengkap.');
    return {
      temperature: Math.round(temperature * 10) / 10,
      humidity: Number.isFinite(humidity) ? Math.round(humidity) : 50,
      latitude,
      longitude,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Lokasi perangkat → cuaca terkini. Melempar error yang layak ditampilkan. */
export async function fetchLocalWeather(): Promise<WeatherReading> {
  const position = await currentPosition().catch((e: GeolocationPositionError | Error) => {
    const code = (e as GeolocationPositionError).code;
    if (code === 1) throw new Error('Izin lokasi ditolak.');
    if (code === 3) throw new Error('Lokasi tidak terbaca (timeout).');
    throw new Error('Lokasi perangkat tidak tersedia.');
  });
  return fetchWeatherAt(position.coords.latitude, position.coords.longitude);
}

/**
 * Apakah izin lokasi SUDAH diberikan sebelumnya?
 * Dipakai agar pengambilan otomatis saat aplikasi dibuka tidak memunculkan
 * dialog izin yang mengagetkan — prompt hanya muncul kalau pengguna menekan
 * tombolnya sendiri.
 */
export async function hasGeolocationPermission(): Promise<boolean> {
  try {
    if (!navigator.permissions?.query) return false;
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state === 'granted';
  } catch {
    return false;
  }
}
