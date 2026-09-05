"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormProgress, type FormSectionState } from "@/components/report/form-progress";
import { LocationPicker, type LocationValue } from "@/components/report/location-picker";
import { PhotoUpload, type PendingPhoto, uploadPendingPhotos } from "@/components/report/photo-upload";
import { ReportOutcome } from "@/components/report/report-outcome";
import { Button } from "@/components/ui/button";
import { Field, FieldSet, Input, Select, Textarea } from "@/components/ui/field";
import { Callout } from "@/components/ui/feedback";
import { GENDERS } from "@/db/enums";
import { apiFetch, ApiError, errorMessage } from "@/lib/api-client";
import { formatGender } from "@/lib/format";
import { foundReportSchema } from "@/lib/validation/reports";

/**
 * The found-person report form.
 *
 * Deliberately not the missing form with fields swapped out. Two differences
 * run through the whole thing and both are about honesty:
 *
 * **An age range, not an age.** Whoever has found an unidentified person can
 * say "somewhere between sixty and seventy-five" and almost never more than
 * that. A single number would invite false precision into the field a match is
 * most likely to be tested against.
 *
 * **A photograph is optional, and the form says why.** Publishing a picture of
 * a vulnerable adult or a child who has consented to nothing is a decision, and
 * sometimes the right one is not to. The missing form encourages photographs;
 * this one explains the trade and leaves it to the reporter.
 *
 * "Where they are now" is collected and never published — see the column
 * comment in src/db/schema.ts for why it is the most sensitive field here.
 */
export function FoundReportForm({ canSubmit }: { canSubmit: boolean }) {
  const router = useRouter();

  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [gender, setGender] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [features, setFeatures] = useState("");
  const [notes, setNotes] = useState("");
  const [foundAt, setFoundAt] = useState("");
  const [whereabouts, setWhereabouts] = useState("");
  const [location, setLocation] = useState<LocationValue>({
    address: "",
    city: "",
    latitude: null,
    longitude: null,
  });
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<{
    reportId: string;
    photosAttempted: number;
    photosAdded: number;
    photoRejections: { index: number; reason: string }[];
  } | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const parsed = foundReportSchema.safeParse({
      estimatedAgeMin: ageMin === "" ? null : ageMin,
      estimatedAgeMax: ageMax === "" ? null : ageMax,
      gender,
      heightCm: heightCm === "" ? null : heightCm,
      distinguishingFeatures: features,
      notes,
      foundAddress: location.address,
      foundCity: location.city,
      foundAt,
      currentWhereabouts: whereabouts,
      latitude: location.latitude,
      longitude: location.longitude,
      contactName,
      contactPhone,
      contactEmail,
    });

    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errors[issue.path.map(String).join(".") || "_"] ??= issue.message;
      }
      setFieldErrors(errors);
      document.getElementById("form-error-summary")?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const created = await apiFetch<{ id: string }>("/api/reports/found", {
        method: "POST",
        body: parsed.data,
      });

      let photosAdded = 0;
      let photoRejections: { index: number; reason: string }[] = [];
      try {
        const uploaded = await uploadPendingPhotos("found", created.id, photos);
        photosAdded = uploaded.added;
        photoRejections = uploaded.rejected;
      } catch (uploadError) {
        photoRejections = [{ index: 0, reason: errorMessage(uploadError) }];
      }

      setOutcome({
        reportId: created.id,
        photosAttempted: photos.length,
        photosAdded,
        photoRejections,
      });
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        setFieldErrors(error.fieldErrors());
      }
      setFormError(errorMessage(error));
      document.getElementById("form-error-summary")?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  if (outcome) {
    return (
      <ReportOutcome
        kind="found"
        reportId={outcome.reportId}
        photosAttempted={outcome.photosAttempted}
        photosAdded={outcome.photosAdded}
        photoRejections={outcome.photoRejections}
      />
    );
  }

  const errorCount = Object.keys(fieldErrors).length;

  /**
   * Which sections are done.
   *
   * Note that "About the person" needs only the gender: on a found report the
   * age is a range that may be genuinely unknown, and marking the section
   * incomplete for a blank the form explicitly permits would be telling
   * somebody they had failed to answer an optional question.
   */
  const sections: FormSectionState[] = [
    { id: "section-person", label: "About the person", complete: Boolean(gender) },
    {
      id: "section-where",
      label: "Where and when",
      complete: Boolean(foundAt && location.address.trim() && location.city.trim()),
    },
    { id: "section-photos", label: "Photographs", complete: photos.length > 0, optional: true },
    {
      id: "section-contact",
      label: "Whereabouts & contact",
      complete: Boolean(contactName.trim() && contactPhone.trim()),
    },
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-10">
      {/* Source order puts the form first; the index is placed alongside it
          visually on large screens. */}
      <form onSubmit={onSubmit} noValidate className="order-1 space-y-10">
      <div
        id="form-error-summary"
        tabIndex={-1}
        aria-live="assertive"
        className="scroll-mt-24 focus:outline-none"
      >
        {formError ? (
          <Callout tone="danger" title="This report was not filed">
            {formError}
          </Callout>
        ) : errorCount > 0 ? (
          <Callout
            tone="danger"
            title={`${errorCount} ${errorCount === 1 ? "field needs" : "fields need"} attention`}
          >
            Scroll down to the highlighted fields — each one explains what is needed.
          </Callout>
        ) : null}
      </div>

      <FieldSet
        id="section-person"
        title="About the person"
        description="Only what you can actually observe. A guess you are unsure of is worse than a blank."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Youngest they might be, in years" error={fieldErrors.estimatedAgeMin}>
            {(props) => (
              <Input
                {...props}
                type="number"
                inputMode="numeric"
                min={0}
                max={130}
                value={ageMin}
                onChange={(event) => setAgeMin(event.target.value)}
                placeholder="60"
              />
            )}
          </Field>

          <Field label="Oldest they might be, in years" error={fieldErrors.estimatedAgeMax}>
            {(props) => (
              <Input
                {...props}
                type="number"
                inputMode="numeric"
                min={0}
                max={130}
                value={ageMax}
                onChange={(event) => setAgeMax(event.target.value)}
                placeholder="75"
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Gender" error={fieldErrors.gender} required>
            {(props) => (
              <Select {...props} value={gender} onChange={(event) => setGender(event.target.value)}>
                <option value="">Choose…</option>
                {GENDERS.map((option) => (
                  <option key={option} value={option}>
                    {formatGender(option)}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {/* Unit in the label, so this input stays level with Gender beside it. */}
          <Field label="Approximate height in cm" error={fieldErrors.heightCm}>
            {(props) => (
              <Input
                {...props}
                type="number"
                inputMode="numeric"
                min={30}
                max={272}
                value={heightCm}
                onChange={(event) => setHeightCm(event.target.value)}
                placeholder="cm"
              />
            )}
          </Field>
        </div>

        <Field
          label="Distinguishing features"
          hint="Clothing, scars, tattoos, glasses, a walking aid — the details a family would recognise."
          error={fieldErrors.distinguishingFeatures}
        >
          {(props) => (
            <Textarea
              {...props}
              value={features}
              onChange={(event) => setFeatures(event.target.value)}
              maxLength={1000}
              rows={3}
            />
          )}
        </Field>

        <Field
          label="Anything else that might help"
          hint="How they were when you found them, what they were able to tell you, an accent or a language they spoke."
          error={fieldErrors.notes}
        >
          {(props) => (
            <Textarea
              {...props}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={2000}
              rows={4}
            />
          )}
        </Field>
      </FieldSet>

      <FieldSet id="section-where" title="Where and when you found them">
        <Field label="When you found them" error={fieldErrors.foundAt} required>
          {(props) => (
            <Input
              {...props}
              type="datetime-local"
              value={foundAt}
              onChange={(event) => setFoundAt(event.target.value)}
              max={new Date().toISOString().slice(0, 16)}
            />
          )}
        </Field>

        <LocationPicker
          value={location}
          onChange={setLocation}
          addressLabel="Where you found them"
          addressHint="A street, a landmark, or an area."
          errors={{
            address: fieldErrors.foundAddress,
            city: fieldErrors.foundCity,
            latitude: fieldErrors.latitude,
          }}
        />
      </FieldSet>

      <FieldSet
        id="section-photos"
        title="Photographs"
        description="Optional here, and worth thinking about before you add one."
      >
        <PhotoUpload
          photos={photos}
          onChange={setPhotos}
          label="Photographs (optional)"
          hint="A photograph makes recognition far more likely. It also publishes the face of someone who has not agreed to it, and who may have had good reason to leave where they came from. If you are unsure, leave this blank — a reviewer can ask you for one privately."
        />
      </FieldSet>

      <FieldSet
        id="section-contact"
        title="Where they are now, and how to reach you"
        description="None of this appears on the public case. It is visible to you and to Locora's reviewers only."
      >
        <Field
          label="Where they are now"
          hint="A hospital, a shelter, a police station, in your care. This is never published — it is how a reviewer reunites them once a match is confirmed."
          error={fieldErrors.currentWhereabouts}
        >
          {(props) => (
            <Textarea
              {...props}
              value={whereabouts}
              onChange={(event) => setWhereabouts(event.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Taken to the district hospital by the police"
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" error={fieldErrors.contactName} required>
            {(props) => (
              <Input
                {...props}
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                maxLength={120}
                autoComplete="name"
              />
            )}
          </Field>

          <Field label="Phone number" error={fieldErrors.contactPhone} required>
            {(props) => (
              <Input
                {...props}
                type="tel"
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value)}
                autoComplete="tel"
                placeholder="+92 300 1234567"
              />
            )}
          </Field>
        </div>

        <Field label="Email address" error={fieldErrors.contactEmail}>
          {(props) => (
            <Input
              {...props}
              type="email"
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
              autoComplete="email"
              spellCheck={false}
            />
          )}
        </Field>
      </FieldSet>

      <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center">
        <Button
          type="submit"
          size="lg"
          loading={submitting}
          loadingLabel="Filing your report"
          disabled={!canSubmit}
          className="w-full sm:w-auto"
        >
          File this report
        </Button>
        <p className="text-xs leading-relaxed text-ink-subtle sm:max-w-sm">
          {canSubmit
            ? "A reviewer reads every report before it is published. Nothing goes public automatically."
            : "Confirm your email address before filing a report."}
        </p>
      </div>
      </form>

      <aside className="order-first lg:order-2">
        <FormProgress sections={sections} />
      </aside>
    </div>
  );
}
