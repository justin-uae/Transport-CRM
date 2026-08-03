"use client";

import { useEffect, useState } from "react";
import PhoneInput, { type Country } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { SearchableCountrySelect } from "./SearchableCountrySelect";
import { detectVisitorCountry } from "@/lib/detectCountry";

const FALLBACK_COUNTRY: Country = "AE";

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
  const [internalValue, setInternalValue] = useState<string | undefined>(defaultValue ?? undefined);
  const [defaultCountry, setDefaultCountry] = useState<Country>(FALLBACK_COUNTRY);

  const current = isControlled ? value : internalValue;

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
        placeholder={placeholder}
        countrySelectComponent={SearchableCountrySelect}
        className="PhoneNumberField"
      />
      {name && <input type="hidden" name={name} value={current ?? ""} />}
    </div>
  );
}
