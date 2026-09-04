"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { LocationPicker, type LocationValue } from "@/components/report/location-picker";
import { PhotoUpload, type PendingPhoto, uploadPendingPhotos } from "@/components/report/photo-upload";
import { ReportOutcome } from "@/components/report/report-outcome";
import { Button } from "@/components/ui/button";
import { Field, FieldSet, Input, Select, Textarea } from "@/components/ui/field";
import { Callout } from "@/components/ui/feedback";
import { GENDERS } from "@/db/enums";
import { apiFetch, ApiError, errorMessage } from "@/lib/api-client";
import { formatGender } from "@/lib/format";
import { missingReportSchema } from "@/lib/validation/reports";

/**
 * The missing-person report form.
 *
 * ## Grouped, not paginated
 *
 * Three fieldsets on one page rather than a wizard. A wizard hides how much is
 * left, loses everything on a refresh unless drafts are persisted, and makes
 * going back to change one answer a chore. One page with `<fieldset>` grouping
 * gives the same structure, keeps every answer visible, and means a browser's
 * own form restoration works.
 *
 * ## The two-step submit
 *
 * The report is created first, then the photographs are uploaded against its
 * new id. That order is forced by the data model — a photograph belongs to a
 * report — and it is why an upload failure is reported rather than thrown: the
 * report is already filed and in the queue. Discarding it because an image
 * failed would mean somebody re-typing everything about a missing relative.
 */
export function MissingReportForm({ canSubmit }: { canSubmit: boolean }) {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [clothing, setClothing] = useState("");
  const [features, setFeatures] = useState("");
  const [lastSeenAt, setLastSeenAt] = useState("");
  const [location, setLocation] = useState<LocationValue>({
    address: "",
    city: "",
    latitude: null,
    longitude: null,
  });
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [policeReference, setPoliceReference] = useState("");
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

    const payload = {
      fullName,
      age,
      gender,
      heightCm: heightCm === "" ? null : heightCm,
      clothingDescription: clothing,
      distinguishingFeatures: features,
      lastSeenAddress: location.address,
      lastSeenCity: location.city,
      lastSeenAt,
      latitude: location.latitude,
      longitude: location.longitude,
      contactName,
      contactPhone,
      contactEmail,
      policeReportNumber: policeReference,
    };

    const parsed = missingReportSchema.safeParse(payload);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errors[issue.path.map(String).join(".") || "_"] ??= issue.message;
      }
      setFieldErrors(errors);
      // Focus is moved to the summary rather than left where it was, so a
      // keyboard or screen-reader user is taken to the explanation instead of
      // being returned to a submit button that appeared to do nothing.
      document.getElementById("form-error-summary")?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const created = await apiFetch<{ id: string }>("/api/reports/missing", {
        method: "POST",
        body: parsed.data,
      });

      let photosAdded = 0;
      let photoRejections: { index: number; reason: string }[] = [];
      try {
        const uploaded = await uploadPendingPhotos("missing", created.id, photos);
        photosAdded = uploaded.added;
        photoRejections = uploaded.rejected;
      } catch (uploadError) {
        // Deliberately not rethrown — see the note at the top of this file.
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
        kind="missing"
        reportId={outcome.reportId}
        photosAttempted={outcome.photosAttempted}
        photosAdded={outcome.photosAdded}
        photoRejections={outcome.photoRejections}
      />
    );
  }

  const errorCount = Object.keys(fieldErrors).length;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-10">
      {/*
        A focusable error summary at the top of the form.
        For a form this long, a scatter of red text below the fold is not
        discoverable — this says how many problems there are and takes focus so
        it is read out immediately.
      */}
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
        title="About the person"
        description="As much as you know. Anything you are unsure of can be left out."
      >
        <Field label="Their full name" error={fieldErrors.fullName} required>
          {(props) => (
            <Input
              {...props}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              maxLength={120}
              autoComplete="off"
              placeholder="First and last name"
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Age" error={fieldErrors.age} required>
            {(props) => (
              <Input
                {...props}
                type="number"
                inputMode="numeric"
                min={0}
                max={130}
                value={age}
                onChange={(event) => setAge(event.target.value)}
                placeholder="Years"
              />
            )}
          </Field>

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

          <Field label="Height" hint="In centimetres" error={fieldErrors.heightCm}>
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
          label="What they were wearing"
          hint="Clothing is often what a stranger remembers most clearly."
          error={fieldErrors.clothingDescription}
        >
          {(props) => (
            <Textarea
              {...props}
              value={clothing}
              onChange={(event) => setClothing(event.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Dark blue school uniform, white trainers, red backpack"
            />
          )}
        </Field>

        <Field
          label="Distinguishing features"
          hint="Scars, tattoos, glasses, a walking aid, a medical condition — anything that would make them recognisable."
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
      </FieldSet>

      <FieldSet
        title="Where and when they were last seen"
        description="The single most useful thing on a report, after a photograph."
      >
        <Field
          label="When they were last seen"
          hint="Your best estimate is fine."
          error={fieldErrors.lastSeenAt}
          required
        >
          {(props) => (
            <Input
              {...props}
              // `datetime-local` gives a native picker on every platform and a
              // usable text field where there is none.
              type="datetime-local"
              value={lastSeenAt}
              onChange={(event) => setLastSeenAt(event.target.value)}
              // Cannot be in the future: a sighting that has not happened yet
              // is a typo, and the schema rejects it server-side too.
              max={new Date().toISOString().slice(0, 16)}
            />
          )}
        </Field>

        <LocationPicker
          value={location}
          onChange={setLocation}
          addressLabel="Where they were last seen"
          addressHint="A street, a landmark, or an area. Not a full home address."
          errors={{
            address: fieldErrors.lastSeenAddress,
            city: fieldErrors.lastSeenCity,
            latitude: fieldErrors.latitude,
          }}
        />
      </FieldSet>

      <FieldSet
        title="Photographs"
        description="A recent, clear photograph of their face does more than every other field combined."
      >
        <PhotoUpload
          photos={photos}
          onChange={setPhotos}
          hint="Published on the public case, so choose ones you are willing for strangers to see. They are removed when the case is closed."
        />
      </FieldSet>

      <FieldSet
        title="How a reviewer can reach you"
        description="Never shown on the public case. Only you and Locora's reviewers ever see these."
      >
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

        <Field
          label="Police reference number"
          hint="If you have already reported this to the police, their reference helps a reviewer verify the case quickly."
          error={fieldErrors.policeReportNumber}
        >
          {(props) => (
            <Input
              {...props}
              value={policeReference}
              onChange={(event) => setPoliceReference(event.target.value)}
              maxLength={80}
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
  );
}
