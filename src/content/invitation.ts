import type { ImageMetadata } from 'astro';

// The couple's own photos (web versions generated from media-originals/; see src/assets/media/README.md).
import groom from '../assets/media/groom.jpg';
import bride from '../assets/media/bride.jpg';
import coverPhoto from '../assets/media/photo-05.jpg';
import backdropPoster from '../assets/media/photo-08.jpg';
import backdropVideo from '../assets/media/background.mp4';
import storyRings from '../assets/media/album/photo-01.jpg';
import storyHands from '../assets/media/album/img_4301.jpg';

// Every photo in src/assets/media/album/ appears in the gallery, in file-name order.
const albumFiles = import.meta.glob<ImageMetadata>('../assets/media/album/*.{jpg,jpeg,png}', { eager: true, import: 'default' });
const album: Photo[] = Object.keys(albumFiles).sort().map((file, index) => ({
  src: albumFiles[file]!,
  alt: `Foto prewedding Vian dan Ghea ${index + 1}`,
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
  holder: string;
  /** Account number or address. null hides the copy button. */
  value: string | null;
}

export interface InvitationContent {
  /** Shows the "temporary content" notice. Set false only after replacing every placeholder. */
  isPreview: boolean;
  couple: { first: string; second: string };
  greeting: string;
  quote: { text: string; source: string };
  /** Main date used for the countdown and calendar link. */
  startsAt: string;
  timeZone: string;
  people: Person[];
  story: { photos: [Photo, Photo]; chapters: { title: string; text: string }[] };
  events: WeddingEvent[];
  dressCode: { text: string; colors: { name: string; hex: string }[] } | null;
  liveStream: { platform: string; url: string | null } | null;
  gallery: { quote: string; photos: Photo[] };
  /** Quote after the gallery; `photo` is optional (null shows the quote on the background video). */
  closingQuote: { text: string; photo: Photo | null } | null;
  gifts: { text: string; accounts: GiftAccount[] } | null;
  closing: { text: string };
  photos: { cover: Photo; desktop: Photo };
  /** Shared background behind the scrolling sections: muted video URL, and the photo shown until it plays. */
  backdrop: { video: string; poster: Photo };
  music: { src: string | null; title: string };
}

export const invitation: InvitationContent = {
  isPreview: true,
  couple: { first: 'Vian', second: 'Ghea' },
  greeting: 'Dengan penuh kebahagiaan, kami mengundang Anda untuk menjadi bagian dari hari istimewa kami.',
  // TEMPORARY: replace with the couple's chosen verse or quote.
  quote: {
    text: 'Cinta tidak saling menatap, tetapi bersama-sama memandang ke arah yang sama.',
    source: 'Antoine de Saint-Exupéry',
  },
  // TEMPORARY DATE for layout and countdown preview only.
  startsAt: '2027-02-20T08:00:00+07:00',
  timeZone: 'Asia/Jakarta',
  people: [
    {
      label: 'Mempelai Pria',
      fullName: 'Vian Rasyid D',
      parentLine: 'Putra dari',
      parents: 'Bapak (nama ayah) & Ibu (nama ibu)',
      instagram: null,
      photo: { src: groom, alt: 'Vian Rasyid D tersenyum mengenakan jas krem di tepi pantai', position: '45% 50%' },
    },
    {
      label: 'Mempelai Wanita',
      fullName: 'Ghea Citra M',
      parentLine: 'Putri dari',
      parents: 'Bapak (nama ayah) & Ibu (nama ibu)',
      instagram: null,
      photo: { src: bride, alt: 'Ghea Citra M tersenyum mengenakan gaun pengantin dan hijab putih di tepi pantai', position: '60% 50%' },
    },
  ],
  story: {
    photos: [
      { src: storyRings, alt: 'Dua tangan memegang sepasang cincin', position: '50% 55%' },
      { src: storyHands, alt: 'Siluet dua tangan saling menggenggam diterpa cahaya senja', position: '50% 35%' },
    ],
    // TEMPORARY: replace with your own story.
    chapters: [
      { title: 'Bab satu: Awal bertemu', text: 'Cerita awal pertemuan kalian akan ditulis di sini. Teks ini hanya contoh.' },
      { title: 'Bab dua: Menjalin hubungan', text: 'Ceritakan bagaimana kalian saling mengenal dan tumbuh bersama.' },
      { title: 'Bab tiga: Lamaran', text: 'Momen ketika kalian memutuskan untuk melangkah bersama.' },
      { title: 'Bab empat: Hari pernikahan', text: 'Awal dari perjalanan baru yang akan kalian rayakan bersama keluarga dan sahabat.' },
    ],
  },
  // TEMPORARY times and places. Use ISO timestamps with an offset.
  events: [
    {
      eyebrow: 'Prosesi',
      title: 'Akad Nikah',
      startsAt: '2027-02-20T08:00:00+07:00',
      endsAt: '2027-02-20T10:00:00+07:00',
      venue: 'Lokasi akan diumumkan',
      address: 'Alamat lengkap akan kami bagikan di sini.',
      mapsUrl: null,
    },
    {
      eyebrow: 'Perayaan',
      title: 'Resepsi',
      startsAt: '2027-02-20T11:00:00+07:00',
      endsAt: '2027-02-20T14:00:00+07:00',
      venue: 'Lokasi akan diumumkan',
      address: 'Alamat lengkap akan kami bagikan di sini.',
      mapsUrl: null,
    },
  ],
  // TEMPORARY palette.
  dressCode: {
    text: 'Kami mengundang Anda untuk mengenakan palet warna berikut agar foto bersama terlihat serasi.',
    colors: [
      { name: 'Krem', hex: '#efe6d8' },
      { name: 'Pasir', hex: '#dcc7ad' },
      { name: 'Merah muda', hex: '#e4b0b5' },
      { name: 'Karamel', hex: '#c99b6c' },
      { name: 'Cokelat', hex: '#9a7550' },
    ],
  },
  // Set url when a streaming link exists; set the whole field to null to hide the section.
  liveStream: { platform: 'YouTube', url: null },
  gallery: {
    quote: 'Setiap foto menyimpan satu cerita kecil tentang perjalanan kami.',
    photos: album,
  },
  closingQuote: {
    text: 'Di antara banyak hal yang kami syukuri, salah satunya adalah bisa menyebut satu sama lain sebagai rumah.',
    photo: null,
  },
  // TEMPORARY: never publish real account numbers until the couple provides them.
  gifts: {
    text: 'Doa restu Anda adalah hadiah terindah bagi kami. Namun jika Anda ingin memberikan tanda kasih, Anda dapat mengirimkannya melalui:',
    accounts: [
      { kind: 'bank', provider: 'Bank (belum diisi)', holder: 'Nama pemilik rekening', value: null },
      { kind: 'wallet', provider: 'Dompet digital (belum diisi)', holder: 'Nama pemilik akun', value: null },
      { kind: 'address', provider: 'Kirim kado', holder: 'Alamat pengiriman', value: null },
    ],
  },
  closing: {
    text: 'Merupakan suatu kebahagiaan dan kehormatan bagi kami apabila Anda berkenan hadir dan memberikan doa restu.',
  },
  photos: {
    // photo-05: on portrait screens the crop centres on the couple.
    cover: { src: coverPhoto, alt: '', position: '53% 50%' },
    desktop: { src: coverPhoto, alt: '' },
  },
  backdrop: { video: backdropVideo, poster: { src: backdropPoster, alt: '' } },
  // Put your licensed audio in public/audio/ and set src to '/audio/your-song.mp3'.
  music: { src: null, title: 'Musik undangan' },
};
