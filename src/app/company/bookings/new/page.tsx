import { redirect } from 'next/navigation';

export default function CompanyNewBookingRedirect() {
  redirect('/trips');
}
