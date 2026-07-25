"use client";

import { useState, useTransition } from "react";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { createEnquiryAction } from "./actions";

const STEPS = ["Customer", "Journey", "Requirements", "Review"];

interface CustomerOption {
  id: string;
  company_name: string | null;
  contact_name: string;
  email: string | null;
}

interface VehicleTypeOption {
  id: string;
  name: string;
  seat_capacity: number;
}

export function NewEnquiryForm({
  customers,
  vehicleTypes,
}: {
  customers: CustomerOption[];
  vehicleTypes: VehicleTypeOption[];
}) {
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [customerMode, setCustomerMode] = useState<"existing" | "new">(customers.length > 0 ? "existing" : "new");
  const [existingCustomerId, setExistingCustomerId] = useState(customers[0]?.id ?? "");
  const [newCustomer, setNewCustomer] = useState({ contactName: "", companyName: "", email: "", phone: "", country: "" });

  const [journey, setJourney] = useState({
    type: "one_way",
    pickup: "",
    destination: "",
    date: "",
    time: "",
    passengers: 1,
    luggage: 0,
  });

  const [requirements, setRequirements] = useState({
    vehicleTypeId: vehicleTypes[0]?.id ?? "",
    wheelchair: false,
    childSeats: 0,
    specialRequirements: "",
    internalNotes: "",
  });

  const selectedCustomer = customers.find((c) => c.id === existingCustomerId);

  function submit() {
    setError(null);
    const formData = new FormData();
    if (customerMode === "existing") {
      formData.set("existingCustomerId", existingCustomerId);
    } else {
      formData.set("newContactName", newCustomer.contactName);
      formData.set("newCompanyName", newCustomer.companyName);
      formData.set("newEmail", newCustomer.email);
      formData.set("newPhone", newCustomer.phone);
      formData.set("newCountry", newCustomer.country);
    }
    formData.set("journeyType", journey.type);
    formData.set("pickupAddress", journey.pickup);
    formData.set("destinationAddress", journey.destination);
    formData.set("pickupDate", journey.date);
    formData.set("pickupTime", journey.time);
    formData.set("passengerCount", String(journey.passengers));
    formData.set("luggageCount", String(journey.luggage));
    formData.set("vehicleTypeId", requirements.vehicleTypeId);
    formData.set("childSeats", String(requirements.childSeats));
    formData.set("specialRequirements", requirements.specialRequirements);
    formData.set("internalNotes", requirements.internalNotes);
    if (requirements.wheelchair) formData.set("wheelchairRequired", "on");

    startTransition(async () => {
      const result = await createEnquiryAction({ error: null }, formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div>
      <div className="grid grid-cols-4 gap-2">
        {STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => setStep(i + 1)}
            className={
              "rounded-xl px-2 py-3 text-xs font-bold md:text-sm " +
              (step === i + 1 ? "bg-primary-500 text-white" : step > i + 1 ? "bg-primary-50 text-primary-700" : "bg-slate-100 text-slate-500")
            }
          >
            {i + 1}. {s}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {step === 1 && (
          <div>
            <SectionTitle title="Customer" sub="Choose an existing customer or enter new contact details" />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setCustomerMode("existing")}
                className={"rounded-xl px-3 py-2 text-sm font-bold " + (customerMode === "existing" ? "bg-primary-500 text-white" : "bg-slate-100")}
              >
                Existing customer
              </button>
              <button
                type="button"
                onClick={() => setCustomerMode("new")}
                className={"rounded-xl px-3 py-2 text-sm font-bold " + (customerMode === "new" ? "bg-primary-500 text-white" : "bg-slate-100")}
              >
                New customer
              </button>
            </div>
            {customerMode === "existing" ? (
              <div className="mt-4">
                <select
                  value={existingCustomerId}
                  onChange={(e) => setExistingCustomerId(e.target.value)}
                  className="w-full rounded-xl border px-3 py-3"
                >
                  {customers.length === 0 && <option value="">No customers yet</option>}
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company_name || c.contact_name} {c.email ? `(${c.email})` : ""}
                    </option>
                  ))}
                </select>
                {selectedCustomer && <p className="mt-2 text-sm text-slate-500">{selectedCustomer.contact_name}</p>}
              </div>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-bold">
                  Contact name
                  <input
                    value={newCustomer.contactName}
                    onChange={(e) => setNewCustomer({ ...newCustomer, contactName: e.target.value })}
                    className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                  />
                </label>
                <label className="text-sm font-bold">
                  Company name
                  <input
                    value={newCustomer.companyName}
                    onChange={(e) => setNewCustomer({ ...newCustomer, companyName: e.target.value })}
                    className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                  />
                </label>
                <label className="text-sm font-bold">
                  Email
                  <input
                    value={newCustomer.email}
                    onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                    className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                  />
                </label>
                <label className="text-sm font-bold">
                  Phone
                  <input
                    value={newCustomer.phone}
                    onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                    className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                  />
                </label>
                <label className="text-sm font-bold">
                  Country
                  <input
                    value={newCustomer.country}
                    onChange={(e) => setNewCustomer({ ...newCustomer, country: e.target.value })}
                    className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                  />
                </label>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div>
            <SectionTitle title="Journey Details" sub="Enter the route, schedule and passenger requirements" />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-bold">
                Journey type
                <select
                  value={journey.type}
                  onChange={(e) => setJourney({ ...journey, type: e.target.value })}
                  className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                >
                  <option value="one_way">One way</option>
                  <option value="return">Return</option>
                  <option value="disposal">Disposal hire</option>
                  <option value="multi_day">Multi-day</option>
                </select>
              </label>
              <label className="text-sm font-bold">
                Pickup date
                <input
                  type="date"
                  value={journey.date}
                  onChange={(e) => setJourney({ ...journey, date: e.target.value })}
                  className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                />
              </label>
              <label className="text-sm font-bold">
                Pickup address
                <input
                  value={journey.pickup}
                  onChange={(e) => setJourney({ ...journey, pickup: e.target.value })}
                  className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                />
              </label>
              <label className="text-sm font-bold">
                Destination
                <input
                  value={journey.destination}
                  onChange={(e) => setJourney({ ...journey, destination: e.target.value })}
                  className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                />
              </label>
              <label className="text-sm font-bold">
                Pickup time
                <input
                  type="time"
                  value={journey.time}
                  onChange={(e) => setJourney({ ...journey, time: e.target.value })}
                  className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                />
              </label>
              <label className="text-sm font-bold">
                Passengers
                <input
                  type="number"
                  min={1}
                  value={journey.passengers}
                  onChange={(e) => setJourney({ ...journey, passengers: Number(e.target.value) })}
                  className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                />
              </label>
              <label className="text-sm font-bold">
                Luggage
                <input
                  type="number"
                  min={0}
                  value={journey.luggage}
                  onChange={(e) => setJourney({ ...journey, luggage: Number(e.target.value) })}
                  className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                />
              </label>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <SectionTitle title="Vehicle & Additional Requirements" sub="Accessibility, child seats and special requirements" />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-bold">
                Vehicle requested
                <select
                  value={requirements.vehicleTypeId}
                  onChange={(e) => setRequirements({ ...requirements, vehicleTypeId: e.target.value })}
                  className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                >
                  {vehicleTypes.length === 0 && <option value="">No vehicle types configured</option>}
                  {vehicleTypes.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} · {v.seat_capacity} seats
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-bold">
                Child seats
                <input
                  type="number"
                  min={0}
                  value={requirements.childSeats}
                  onChange={(e) => setRequirements({ ...requirements, childSeats: Number(e.target.value) })}
                  className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                />
              </label>
              <label className="flex items-center gap-2 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={requirements.wheelchair}
                  onChange={(e) => setRequirements({ ...requirements, wheelchair: e.target.checked })}
                  className="h-4 w-4"
                />
                Wheelchair accessible required
              </label>
              <label className="text-sm font-bold md:col-span-2">
                Special requirements
                <textarea
                  value={requirements.specialRequirements}
                  onChange={(e) => setRequirements({ ...requirements, specialRequirements: e.target.value })}
                  className="mt-2 min-h-20 w-full rounded-xl border px-3 py-3 font-normal"
                />
              </label>
              <label className="text-sm font-bold md:col-span-2">
                Internal notes
                <textarea
                  value={requirements.internalNotes}
                  onChange={(e) => setRequirements({ ...requirements, internalNotes: e.target.value })}
                  className="mt-2 min-h-20 w-full rounded-xl border px-3 py-3 font-normal"
                />
              </label>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <SectionTitle title="Review" sub="Confirm the details before saving this enquiry" />
            <div className="mt-5 space-y-3 rounded-2xl bg-slate-50 p-5 text-sm">
              <div className="flex justify-between border-b py-2">
                <span className="text-slate-500">Customer</span>
                <b>{customerMode === "existing" ? selectedCustomer?.company_name || selectedCustomer?.contact_name || "—" : newCustomer.contactName}</b>
              </div>
              <div className="flex justify-between border-b py-2">
                <span className="text-slate-500">Journey</span>
                <b>
                  {journey.pickup || "—"} → {journey.destination || "—"}
                </b>
              </div>
              <div className="flex justify-between border-b py-2">
                <span className="text-slate-500">Date</span>
                <b>{journey.date || "—"} {journey.time}</b>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-500">Passengers</span>
                <b>{journey.passengers}</b>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>}

      <div className="mt-6 flex justify-between border-t pt-5">
        <button
          type="button"
          disabled={step === 1}
          onClick={() => setStep(Math.max(1, step - 1))}
          className="rounded-xl border px-4 py-2.5 text-sm font-bold disabled:opacity-40"
        >
          Previous
        </button>
        {step < 4 ? (
          <button
            type="button"
            onClick={() => setStep(step + 1)}
            className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white"
          >
            Next Step →
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={submit}
            className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save & Continue to Quote"}
          </button>
        )}
      </div>
    </div>
  );
}
