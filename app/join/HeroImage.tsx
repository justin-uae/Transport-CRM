"use client";

// public/images/supplier-hero.webp — resized to 1400px wide and re-encoded
// at quality 78 (was a 1.9MB JPEG straight out of the camera/generator, now
// ~106KB) so the hero doesn't ship a multi-megabyte image to every visitor.
// If you swap in a new photo, keep it in that same compressed webp form
// rather than dropping a raw JPEG back in. Quietly hides itself on load
// failure so a missing file falls back to the gradient behind it instead of
// showing a broken-image icon.
export function HeroImage() {
  return (
    <img
      src="/images/supplier-hero.webp"
      alt=""
      className="h-full w-full object-cover"
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
    />
  );
}
