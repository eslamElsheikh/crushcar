import { V2Logo } from '@/components/v2/Logo';

export default function Loading() {
  return (
    <div className="v2 flex min-h-[70vh] flex-col items-center justify-center bg-transparent">
      <div className="mb-4">
        <V2Logo height={44} />
      </div>
      <div className="size-8 rounded-full border-2 border-slate-200 border-t-[#0066FF] animate-spin" />
    </div>
  );
}
