/* MOCK ONLY — isolated prototype data. Not connected to production APIs. */

export interface MockDestination {
  id: string;
  fromEn: string;
  toEn: string;
  fromAr: string;
  toAr: string;
  price: number;
  image: string;
}

export const mockDestinations: MockDestination[] = [
  {
    id: 'cairo-mansoura',
    fromEn: 'Cairo',
    toEn: 'Mansoura',
    fromAr: 'القاهرة',
    toAr: 'المنصورة',
    price: 180,
    image:
      'https://images.unsplash.com/photo-1539768942893-daf53e448371?auto=format&fit=crop&w=800&q=70',
  },
  {
    id: 'alex-cairo',
    fromEn: 'Alexandria',
    toEn: 'Cairo',
    fromAr: 'الإسكندرية',
    toAr: 'القاهرة',
    price: 220,
    image:
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=70',
  },
  {
    id: 'hurghada-cairo',
    fromEn: 'Hurghada',
    toEn: 'Cairo',
    fromAr: 'الغردقة',
    toAr: 'القاهرة',
    price: 450,
    image:
      'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=800&q=70',
  },
  {
    id: 'luxor-cairo',
    fromEn: 'Luxor',
    toEn: 'Cairo',
    fromAr: 'الأقصر',
    toAr: 'القاهرة',
    price: 380,
    image:
      'https://images.unsplash.com/photo-1587975844610-3897b83bab87?auto=format&fit=crop&w=800&q=70',
  },
];
