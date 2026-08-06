"use client";

import { useEffect, useState } from "react";
import PhoneInput, { type Country } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { SearchableCountrySelect } from "./SearchableCountrySelect";
import { detectVisitorCountry } from "@/lib/detectCountry";

const FALLBACK_COUNTRY: Country = "AE";

/** react-phone-number-input requires E.164 or throws — some legacy records predate that format. */
function isE164(value?: string | null): value is string {
  return !!value && /^\+[1-9]\d{1,14}$/.test(value);
}

/**
 * Dial-code phone input used everywhere a phone/WhatsApp number is
 * collected. Wraps react-phone-number-input with a searchable country
 * dropdown (the library's own selector is a plain <select>) and defaults
 * the dial code to the visitor's IP-detected country the first time it
 * renders with no value.
 *
 * Works both as a controlled input (pass `value`/`onChange`) and inside a
 * plain `<form action={...}>` (pass `name`, read a hidden input's value from
 * FormData) since several forms in this app use uncontrolled native
 * submission rather than React state.
 */
export function PhoneNumberField({
  name,
  value,
  defaultValue,
  onChange,
  disabled,
  placeholder,
  className,
}: {
  name?: string;
  value?: string;
  defaultValue?: string | null;
  onChange?: (value: string | undefined) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<string | undefined>(isE164(defaultValue) ? defaultValue : undefined);
  const [defaultCountry, setDefaultCountry] = useState<Country>(FALLBACK_COUNTRY);

  const current = isControlled ? value : internalValue;
  // Surfaces a legacy non-E.164 number (can't be handed to the input as `value`
  // without it throwing) so the field isn't silently blank for existing data.
  const legacyValueHint = !isControlled && defaultValue && !isE164(defaultValue) ? `Current: ${defaultValue}` : undefined;

  useEffect(() => {
    if (current) return;
    let cancelled = false;
    detectVisitorCountry().then((code) => {
      if (!cancelled && code) setDefaultCountry(code as Country);
    });
    return () => {
      cancelled = true;
    };
    // Only ever needs to run once per mount — re-detecting on every
    // keystroke would fight the user's own country selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChange(next: string | undefined) {
    if (!isControlled) setInternalValue(next);
    onChange?.(next);
  }

  return (
    <div className={className}>
      <PhoneInput
        international
        defaultCountry={defaultCountry}
        value={current}
        onChange={handleChange}
        disabled={disabled}
        placeholder={placeholder ?? legacyValueHint}
        countrySelectComponent={SearchableCountrySelect}
        className="PhoneNumberField"
      />
      {/* Falls back to the raw legacy value (rather than "") so saving other
          fields on this form doesn't wipe out a phone number the user never
          touched, just because it predates E.164 formatting. */}
      {name && <input type="hidden" name={name} value={current ?? (legacyValueHint ? defaultValue! : "")} />}
    </div>
  );
}
