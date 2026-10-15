import type { ImageMetadata } from 'astro';

// TEMPORARY PHOTOS: free Unsplash images used only as layout placeholders.
// Replace each import with the couple's own photos (see src/assets/placeholder/CREDITS.md).
import beachVeil from '../assets/placeholder/beach-veil.jpg';
import blackBeach from '../assets/placeholder/black-beach.jpg';
import hillsWalk from '../assets/placeholder/hills-walk.jpg';
import veilField from '../assets/placeholder/veil-field.jpg';
import coupleGolden from '../assets/placeholder/couple-golden.jpg';
import brideRoad from '../assets/placeholder/bride-road.jpg';
import handsRing from '../assets/placeholder/hands-ring.jpg';
import holdingHands from '../assets/placeholder/holding-hands.jpg';
import ringHand from '../assets/placeholder/ring-hand.jpg';
import bouquetDark from '../assets/placeholder/bouquet-dark.jpg';
import gazebo from '../assets/placeholder/gazebo.jpg';
import shoes from '../assets/placeholder/shoes.jpg';
import veilMono from '../assets/placeholder/veil-mono.jpg';
import aisle from '../assets/placeholder/aisle.jpg';
import table from '../assets/placeholder/table.jpg';
import confettiKiss from '../assets/placeholder/confetti-kiss.jpg';
import bouquetPeach from '../assets/placeholder/bouquet-peach.jpg';
import ringsFlowers from '../assets/placeholder/rings-flowers.jpg';
import balloons from '../assets/placeholder/balloons.jpg';
import mrMrsSign from '../assets/placeholder/mr-mrs-sign.jpg';
import flowerArch from '../assets/placeholder/flower-arch.jpg';
import boutonnieres from '../assets/placeholder/boutonnieres.jpg';

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
  story: { photos: [Photo, Photo]; background: Photo; chapters: { title: string; text: string }[] };
  events: WeddingEvent[];
  dressCode: { text: string; colors: { name: string; hex: string }[] } | null;
  liveStream: { platform: string; url: string | null } | null;
  gallery: { quote: string; photos: Photo[] };
  closingQuote: { text: string; photo: Photo } | null;
  gifts: { text: string; accounts: GiftAccount[] } | null;
  closing: { text: string; photo: Photo };
  photos: { cover: Photo; desktop: Photo; hero: Photo[]; saveTheDate: Photo; events: Photo; dressCode: Photo; live: Photo; rsvp: Photo; wishes: Photo };
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
      photo: { src: coupleGolden, alt: 'Foto sementara mempelai pria', position: '68% 50%' },
    },
    {
      label: 'Mempelai Wanita',
      fullName: 'Ghea Citra M',
      parentLine: 'Putri dari',
      parents: 'Bapak (nama ayah) & Ibu (nama ibu)',
      instagram: null,
      photo: { src: brideRoad, alt: 'Foto sementara mempelai wanita', position: '50% 40%' },
    },
  ],
  story: {
    photos: [
      { src: holdingHands, alt: 'Foto sementara: dua tangan saling menggenggam' },
      { src: ringHand, alt: 'Foto sementara: tangan dengan cincin' },
    ],
    background: { src: handsRing, alt: '' },
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
    photos: [
      { src: coupleGolden, alt: 'Foto sementara: pasangan tersenyum di bawah sinar matahari' },
      { src: confettiKiss, alt: 'Foto sementara: pasangan dihujani kelopak bunga' },
      { src: veilField, alt: 'Foto sementara: pasangan berselimut kerudung di padang rumput' },
      { src: bouquetPeach, alt: 'Foto sementara: buket bunga peach' },
      { src: blackBeach, alt: 'Foto sementara: pasangan di pantai berpasir hitam' },
      { src: ringsFlowers, alt: 'Foto sementara: cincin di antara bunga' },
      { src: hillsWalk, alt: 'Foto sementara: pasangan berjalan di perbukitan' },
      { src: beachVeil, alt: 'Foto sementara: pasangan di tepi pantai' },
      { src: balloons, alt: 'Foto sementara: perayaan dengan balon' },
      { src: flowerArch, alt: 'Foto sementara: rangkaian bunga di gerbang' },
      { src: mrMrsSign, alt: 'Foto sementara: papan bertuliskan Mr & Mrs' },
      { src: boutonnieres, alt: 'Foto sementara: dua bros bunga' },
    ],
  },
  closingQuote: {
    text: 'Di antara banyak hal yang kami syukuri, salah satunya adalah bisa menyebut satu sama lain sebagai rumah.',
    photo: { src: veilMono, alt: 'Foto sementara hitam putih pasangan berkerudung' },
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
    photo: { src: blackBeach, alt: '' },
  },
  photos: {
    cover: { src: beachVeil, alt: '', position: '50% 35%' },
    desktop: { src: hillsWalk, alt: '' },
    hero: [
      { src: veilField, alt: '' },
      { src: coupleGolden, alt: '', position: '65% 50%' },
      { src: confettiKiss, alt: '' },
    ],
    saveTheDate: { src: bouquetDark, alt: '' },
    events: { src: gazebo, alt: '' },
    dressCode: { src: shoes, alt: '' },
    live: { src: veilField, alt: '' },
    rsvp: { src: aisle, alt: '' },
    wishes: { src: table, alt: '' },
  },
  // Put your licensed audio in public/audio/ and set src to '/audio/your-song.mp3'.
  music: { src: null, title: 'Musik undangan' },
};
