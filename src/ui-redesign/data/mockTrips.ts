/* MOCK ONLY — isolated prototype data. Not connected to production APIs. */

export interface MockTrip {
  id: string;
  fromEn: string;
  toEn: string;
  fromAr: string;
  toAr: string;
  depart: string;
  arrive: string;
  durationEn: string;
  durationAr: string;
  stops: number;
  rating: number;
  price: number;
  image: string;
}

export const mockTrips: MockTrip[] = [
  {
    id: 't1',
    fromEn: 'Cairo',
    toEn: 'Mansoura',
    fromAr: 'القاهرة',
    toAr: 'المنصورة',
    depart: '08:30 AM',
    arrive: '11:45 AM',
    durationEn: '3h 15m',
    durationAr: '3 س 15 د',
    stops: 12,
    rating: 4.8,
    price: 180,
    image:
      'https://images.unsplash.com/photo-1570125909232-eb263c188f7e?auto=format&fit=crop&w=800&q=70',
  },
  {
    id: 't2',
    fromEn: 'Alexandria',
    toEn: 'Cairo',
    fromAr: 'الإسكندرية',
    toAr: 'القاهرة',
    depart: '07:00 AM',
    arrive: '11:30 AM',
    durationEn: '4h 30m',
    durationAr: '4 س 30 د',
    stops: 8,
    rating: 4.6,
    price: 220,
    image:
      'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&w=800&q=70',
  },
  {
    id: 't3',
    fromEn: 'Hurghada',
    toEn: 'Cairo',
    fromAr: 'الغردقة',
    toAr: 'القاهرة',
    depart: '09:00 AM',
    arrive: '02:30 PM',
    durationEn: '5h 30m',
    durationAr: '5 س 30 د',
    stops: 10,
    rating: 4.7,
    price: 450,
    image:
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=70',
  },
  {
    id: 't4',
    fromEn: 'Luxor',
    toEn: 'Cairo',
    fromAr: 'الأقصر',
    toAr: 'القاهرة',
    depart: '06:00 AM',
    arrive: '11:00 AM',
    durationEn: '5h 0m',
    durationAr: '5 س',
    stops: 9,
    rating: 4.5,
    price: 380,
    image:
      'https://images.unsplash.com/photo-1539768942893-daf53e448371?auto=format&fit=crop&w=800&q=70',
  },
];
