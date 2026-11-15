import type { ImageMetadata } from 'astro';

// The couple's own photos (web versions generated from media-originals/; see src/assets/media/README.md).
import groom from '../assets/media/groom.jpg';
import bride from '../assets/media/bride.jpg';
import coverPhoto from '../assets/media/cover.jpg';
import backdropPoster from '../assets/media/background.jpg';
import backdropVideo from '../assets/media/background.mp4';
import backdropBlurVideo from '../assets/media/background-blur.mp4';
import storyHands from '../assets/media/story-2.jpg';
import clipPoster from '../assets/media/video-clip.jpg';
// 1200×630 link preview built from img_4303 by `npm run media:preview`.
import linkPreview from '../assets/media/link-preview.jpg';

// Every photo in src/assets/media/album/ appears in the gallery, in file-name order.
const albumFiles = import.meta.glob<ImageMetadata>('../assets/media/album/*.{jpg,jpeg,png}', { eager: true, import: 'default' });
// Camera files (upper-case extensions, HEIC) are not picked up above; stop the build instead of
// silently leaving them out of the gallery.
const cameraFiles = Object.keys(import.meta.glob('../assets/media/album/*.{JPG,JPEG,PNG,HEIC,heic,HEIF,heif}'));
if (cameraFiles.length) {
  throw new Error(`Camera files in src/assets/media/album/: ${cameraFiles.map((f) => f.split('/').pop()).join(', ')}. `
    + 'Move them to media-originals/album/ and run `npm run media:photos -- media-originals/album/<file>` (see src/assets/media/README.md).');
}
// Unprocessed originals with a lower-case extension get through the check above; the photo
// script makes masters of at most 2400 px, so anything larger has not been through it.
const oversized = Object.entries(albumFiles).filter(([, image]) => Math.max(image.width, image.height) > 2400);
if (oversized.length) {
  throw new Error(`Unprocessed photos in src/assets/media/album/: ${oversized.map(([f]) => f.split('/').pop()).join(', ')}. `
    + 'Move them to media-originals/album/ and run `npm run media:photos -- media-originals/album/<file>` (see src/assets/media/README.md).');
}
// `file` (name without folder) is what `gallery.moments` refers to.
const album: (Photo & { file: string })[] = Object.keys(albumFiles).sort().map((file, index) => ({
  src: albumFiles[file]!,
  alt: `Foto Vian dan Ghea ${index + 1}`,
  file: file.split('/').pop()!,
}));

export interface Photo {
  src: ImageMetadata;
  alt: string;
  /** CSS object-position for cropped placements, e.g. '50% 30%'. */
  position?: string;
}

export interface Person {
  label: string;
  fullName: string;
  parentLine: string;
  parents: string;
  instagram: string | null;
  photo: Photo;
}

export interface WeddingEvent {
  eyebrow: string;
  title: string;
  /** ISO timestamps with an explicit offset. */
  startsAt: string;
  endsAt: string;
  venue: string;
  address: string;
  mapsUrl: string | null;
}

export interface GiftAccount {
  kind: 'bank' | 'wallet' | 'address';
  provider: string;
  /** Account holder or recipient line; null hides it. */
  holder: string | null;
  /** Account number or address. null hides the copy button. */
  value: string | null;
}

export interface InvitationContent {
  couple: { first: string; second: string };
  /** The couple's hashtag, shown as the faint watermark in the hero. Written exactly as it should appear. */
  hashtag: string;
  greeting: string;
  quote: { text: string; source: string };
  /** Verse shown between the hero and the couple: Arabic text, its translation and the reference. null hides it. */
  verse: { arabic: string; translation: string; source: string } | null;
  /** Main date used for the countdown and calendar link. */
  startsAt: string;
  timeZone: string;
  people: Person[];
  /** One photo shows centered; two show side by side. */
  story: { photos: [Photo] | [Photo, Photo]; chapters: { title: string; text: string }[] };
  events: WeddingEvent[];
  dressCode: { text: string; colors: { name: string; hex: string }[] } | null;
  liveStream: { platform: string; url: string | null } | null;
  /** `video` (a YouTube video ID) is shown above the album photos; the player loads only when a guest presses play. */
  gallery: {
    quote: string;
    video: { youtubeId: string; poster: Photo; title: string } | null;
    photos: (Photo & { file?: string })[];
    /**
     * Album photos from the same moment (near-identical shots), by file name. The gallery is
     * shuffled on every visit, and photos in the same group are never placed next to each other.
     */
    moments: string[][];
  };
  /** Quote after the gallery; `photo` is optional (null shows the quote on the background video). */
  closingQuote: { text: string; photo: Photo | null } | null;
  /**
   * `accounts` are always shown; `more` opens in a pop-up from the "Lihat rekening lainnya"
   * button. `showMore: false` hides that button and leaves `more` out of the page entirely.
   */
  gifts: { text: string; accounts: GiftAccount[]; more: GiftAccount[]; showMore: boolean } | null;
  closing: { text: string };
  /** Large photo on the left side on desktop (phones show the background video instead). */
  photos: { desktop: Photo };
  /**
   * Shared background behind the invitation column: the muted teaser shown whole (uncropped),
   * a tiny copy of it blurred to fill the rest of the column, and the photo shown until they play.
   */
  backdrop: { video: string; blurVideo: string; poster: Photo };
  /** Image shown when the invitation link is shared (WhatsApp, Instagram, …); 1200×630. */
  linkPreview: Photo;
  music: { src: string | null; title: string };
}

export const invitation: InvitationContent = {
  couple: { first: 'Vian', second: 'Ghea' },
  hashtag: '#GHEArtofVIAN',
  greeting: 'Dengan penuh kebahagiaan, kami mengundang Anda untuk menjadi bagian dari hari istimewa kami.',
  quote: {
    text: 'Beberapa pertemuan memilih caranya sendiri, salah satunya lewat mimpi.',
    source: '',
  },
  // Provided by the couple (2026-11-14), text exactly as supplied.
  verse: {
    arabic: 'وَمِنْ آيَاتِهِ أَنْ خَلَقَ لَكُمْ مِنْ أَنْفُسِكُمْ أَزْوَاجًا لِتَسْكُنُوا إِلَيْهَا وَجَعَلَ بَيْنَكُمْ مَوَدَّةً وَرَحْمَةً ۚ إِنَّ فِي ذَٰلِكَ لَآيَاتٍ لِقَوْمٍ يَتَفَكَّرُونَ',
    translation: 'Dan di antara tanda-tanda (kebesaran)-Nya ialah Dia menciptakan pasangan-pasangan untukmu dari jenismu sendiri, agar kamu cenderung dan merasa tenteram kepadanya, dan Dia menjadikan di antaramu rasa kasih dan sayang. Sungguh, pada yang demikian itu benar-benar terdapat tanda-tanda (kebesaran Allah) bagi kaum yang berpikir.',
    source: 'QS. Ar-Rum Ayat 21',
  },
  // Sunday 20 December 2026, Mataram (WITA, UTC+8).
  startsAt: '2026-12-20T08:30:00+08:00',
  timeZone: 'Asia/Makassar',
  people: [
    {
      label: 'The Groom',
      fullName: 'Vian Rasyid Diyatma, S.Kom.',
      parentLine: 'Putra Kedua Dari',
      parents: 'Bapak (Alm.) Dayat, S.Pd. M.Pd. & Ibu Fatmawati Nurhayaningsih, SKM.',
      instagram: "@vian_rd",
      photo: { src: groom, alt: 'Vian Rasyid Diyatma tersenyum mengenakan jas krem di tepi pantai', position: '45% 50%' },
    },
    {
      label: 'The Bride',
      fullName: 'Ghea Citra Melani, S.Tr.Kes.',
      parentLine: 'Putri Ketiga Dari',
      parents: 'Bapak Mukillah & Ibu Dra. Pahriyah',
      instagram: '@gheacm',
      photo: { src: bride, alt: 'Ghea Citra Melani tersenyum mengenakan gaun pengantin putih berenda dan hijab dengan kerudung tipis di pantai', position: '50% 50%' },
    },
  ],
  story: {
    photos: [
      { src: storyHands, alt: 'Siluet dua tangan saling menggenggam diterpa cahaya senja', position: '50% 35%' },
    ],
    // The couple's own story (2026-11-14).
    chapters: [
      {
        title: 'Awal Bertemu',
        text: 'Mungkin bagi sebagian orang, mimpi hanya bunga tidur. Tapi, bagaimana jika mimpi itu berlanjut di kehidupan nyata tanpa pernah direncakan sebelumnya? Salah satu cafe di kota Mataram menjadi saksi pertemuan kami di pertengahan tahun 2023. Lewat obrolan kecil dan sederhana, kami semakin mengenal satu sama lain.',
      },
      {
        title: 'Menjalin Hubungan',
        text: 'Dari obrolan kecil dan sederhana itu, muncul rasa nyaman tiap kali berbagi cerita. Tak hanya itu, kami juga menyukai karakter satu sama lain. Perpaduan karakter itu bisa melengkapi bagian yang kurang dari kami. Akhirnya, kami memutuskan untuk menjalin hubungan.',
      },
      {
        title: 'Lamaran',
        text: '21 Oktober 2026, kami selangkah lebih dekat dengan tujuan hubungan ini. Untuk pertama kalinya, keluarga besar kami bertemu dan berkenalan di momen ini. Atas izin Allah, semuanya berjalan lancar sesuai dengan apa yang kami harapkan.',
      },
      {
        title: 'Hari Pernikahan',
        text: '20 Desember 2026, adalah hari yang kami pilih untuk melangsungkan pernikahan. Dengan izin Allah, niatan baik ini terlaksana dengan lancar. Sakinah mawaddah warahmah, adalah harapan kami dalam mengarungi kehidupan pernikahan kelak.',
      },
    ],
  },
  // Use ISO timestamps with an offset.
  events: [
    {
      eyebrow: 'Prosesi',
      title: 'Akad Nikah',
      startsAt: '2026-12-20T08:30:00+08:00',
      endsAt: '2026-12-20T09:30:00+08:00',
      venue: 'Asrama Haji Mataram, Bir Ali 2',
      // Street address not supplied yet; add it here when available.
      address: 'Mataram, Nusa Tenggara Barat',
      // Search link; replace with the exact Google Maps share link (pin) when available.
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Asrama+Haji+Mataram+NTB',
    },
    {
      eyebrow: 'Perayaan',
      title: 'Resepsi',
      startsAt: '2026-12-20T10:30:00+08:00',
      endsAt: '2026-12-20T12:30:00+08:00',
      venue: 'Asrama Haji Mataram, Bir Ali 2',
      // Street address not supplied yet; add it here when available.
      address: 'Mataram, Nusa Tenggara Barat',
      // Search link; replace with the exact Google Maps share link (pin) when available.
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Asrama+Haji+Mataram+NTB',
    },
  ],
  // No dress-code section (removed by the couple). To show one, set { text, colors: [{ name, hex }] }.
  dressCode: null,
  // Set url when a streaming link exists; set the whole field to null to hide the section.
  liveStream: { platform: 'YouTube', url: null },
  gallery: {
    quote: 'Setiap foto menyimpan satu cerita kecil tentang perjalanan kami.',
    // https://www.youtube.com/watch?v=gpVMepCXalA
    video: { youtubeId: 'gpVMepCXalA', poster: { src: clipPoster, alt: '' }, title: 'Video klip prewedding Ghea & Vian' },
    photos: album,
    moments: [
      ['img_4286.jpg', 'img_4287b.jpg'], // standing among the trees
      ['img_4284b.jpg', 'img_4305.jpg', 'photo-09.jpg'], // garden: bench, lying on the grass, veil
      ['img_4293b.jpg', 'img_4297.jpg', 'img_4298.jpg'], // veil
      ['img_4299.jpg', 'img_4300.jpg', 'photo-08.jpg'], // beach walk
      ['img_4290.jpg', 'img_4294.jpg'], // night lights and sparks
      ['img_4087.jpg', 'img_4113.jpg', 'img_4117.jpg'], // engagement: at the flower wall
    ],
  },
  closingQuote: {
    text: 'Di antara banyak hal yang kami syukuri, salah satunya adalah bisa menyebut satu sama lain sebagai rumah.',
    photo: null,
  },
  // Provided by the couple (2026-11-14). The copy button copies `value` exactly as written.
  gifts: {
    text: 'Doa restu Anda adalah hadiah terindah bagi kami. Namun jika Anda ingin memberikan tanda kasih, Anda dapat mengirimkannya melalui:',
    accounts: [
      { kind: 'bank', provider: 'Superbank', holder: 'Ghea Citra Melani', value: '000001628502' },
      {
        kind: 'address',
        provider: 'Kirim kado',
        holder: 'Penerima: Ghea Citra Melani',
        value: 'Jl. Asri Blok M No. 8, Perum Elit Kota Mataram Asri, Lingkar Selatan, Kota Mataram, Sekarbela, Nusa Tenggara Barat (NTB), Indonesia 83116',
      },
    ],
    // Hidden for now at the couple's request (2026-11-14); set true to show the button again.
    showMore: false,
    more: [
      { kind: 'bank', provider: 'Mandiri', holder: 'Vian Rasyid', value: '1310015634357' },
      { kind: 'bank', provider: 'BCA', holder: 'Vian Rasyid', value: '0700237524' },
      { kind: 'bank', provider: 'Seabank', holder: 'Vian Rasyid', value: '901279716707' },
      // In the groom's name. Which e-wallet app(s) this number is for was not specified.
      { kind: 'wallet', provider: 'Dompet digital', holder: 'Vian Rasyid', value: '082237058889' },
    ],
  },
  closing: {
    text: 'Merupakan suatu kebahagiaan dan kehormatan bagi kami apabila Anda berkenan hadir dan memberikan doa restu.',
  },
  photos: {
    desktop: { src: coverPhoto, alt: '' },
  },
  backdrop: { video: backdropVideo, blurVideo: backdropBlurVideo, poster: { src: backdropPoster, alt: '' } },
  linkPreview: { src: linkPreview, alt: 'Vian dan Ghea di bawah kerudung saat matahari terbenam' },
  // The full audio track of the prewedding video clip (see public/audio/README.md).
  music: { src: '/audio/music.mp3', title: 'Musik undangan' },
};
