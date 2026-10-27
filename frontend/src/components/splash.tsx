import { BrandMark } from './brand-mark';

export function Splash({
  label = 'Opening your duka…',
  name = 'Duka'
}: {
  label?: string;
  name?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-cream">
      <div className="animate-float">
        <BrandMark size="lg" />
      </div>
      <div className="text-center">
        <p className="font-display text-2xl font-semibold text-ink">{name}</p>
        <p className="mt-1 text-sm text-muted">{label}</p>
      </div>
      <div className="flex gap-1.5">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400"
            style={{ animationDelay: `${index * 140}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
