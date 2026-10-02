// Single source for destination photo attributions.
// docs/IMAGE_CREDITS.md mirrors this data. /credits renders from it.
export interface ImageCredit {
  slug: string;
  cityAr: string;
  cityEn: string;
  file: string;
  sourceTitle: string;
  sourceUrl: string;
  author: string;
  license: string;
  localPath: string;
}

export const IMAGE_CREDITS: ImageCredit[] = [
  {
    slug: 'aswan',
    cityAr: 'أسوان',
    cityEn: 'Aswan',
    file: 'Panoramic view of Aswan 2, Egypt.jpg',
    sourceTitle: 'Panoramic view of Aswan 2, Egypt',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Panoramic_view_of_Aswan_2,_Egypt.jpg',
    author: 'Vyacheslav Argenberg',
    license: 'CC BY 4.0',
    localPath: '/destinations/aswan.jpg',
  },
  {
    slug: 'luxor',
    cityAr: 'الأقصر',
    cityEn: 'Luxor',
    file: 'Luxor Temple R04.jpg',
    sourceTitle: 'Luxor Temple R04',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Luxor_Temple_R04.jpg',
    author: 'Marc Ryckaert',
    license: 'CC BY 3.0',
    localPath: '/destinations/luxor.jpg',
  },
  {
    slug: 'alexandria',
    cityAr: 'الإسكندرية',
    cityEn: 'Alexandria',
    file: 'Citadel of Qaitbay, Alexandria.jpg',
    sourceTitle: 'Citadel of Qaitbay, Alexandria',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Citadel_of_Qaitbay,_Alexandria.jpg',
    author: 'Amal Nagi',
    license: 'CC BY-SA 4.0',
    localPath: '/destinations/alexandria.jpg',
  },
  {
    slug: 'ismailia',
    cityAr: 'الإسماعيلية',
    cityEn: 'Ismailia',
    file: 'ISMAILIA, NEMRA 6 suez canal small part.jpg',
    sourceTitle: 'ISMAILIA, NEMRA 6 suez canal small part',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:ISMAILIA,_NEMRA_6_suez_canal_small_part.jpg',
    author: 'Mariam elsadek',
    license: 'CC BY-SA 4.0',
    localPath: '/destinations/ismailia.jpg',
  },
];
