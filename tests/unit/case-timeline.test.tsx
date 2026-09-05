import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CaseTimeline } from "@/components/cases/case-timeline";

/**
 * The case timeline.
 *
 * Tested through what it renders rather than by exporting its step builder,
 * because the thing that matters is what a reporter reads on the page. A test
 * against an internal function would keep passing if the component stopped
 * calling it correctly.
 */

const FILED = "2026-08-01T10:00:00.000Z";
const REVIEWED = "2026-08-02T09:00:00.000Z";

function steps() {
  // Each step is a list item, so the sequence is queryable as one.
  return within(screen.getByRole("list")).getAllByRole("listitem");
}

describe("a report waiting for review", () => {
  it("shows what has happened and what has not", () => {
    render(<CaseTimeline status="pending" createdAt={FILED} />);

    expect(screen.getByText("Report filed")).toBeInTheDocument();
    expect(screen.getByText("Waiting for a reviewer")).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
    expect(steps()).toHaveLength(3);
  });

  it("answers the question a reporter actually opens the page with", () => {
    render(<CaseTimeline status="pending" createdAt={FILED} />);
    // Whether anybody has looked at it yet — stated, not implied by a badge.
    expect(
      screen.getByText(/a person reads every report before it is published/i),
    ).toBeInTheDocument();
  });

  it("marks the current step for assistive technology, not only by colour", () => {
    render(<CaseTimeline status="under_review" createdAt={FILED} />);
    expect(screen.getByText("Being checked")).toBeInTheDocument();
    expect(screen.getByText("— current step")).toBeInTheDocument();
  });
});

describe("a declined report", () => {
  it("ends with its own step rather than a struck-through publication", () => {
    render(<CaseTimeline status="rejected" createdAt={FILED} reviewedAt={REVIEWED} />);

    expect(screen.getByText("Not published")).toBeInTheDocument();
    // Reusing the happy path would tell somebody their report is on its way to
    // publication when it is not.
    expect(screen.queryByText("Published")).not.toBeInTheDocument();
    expect(screen.queryByText(/reviewed and published/i)).not.toBeInTheDocument();
    expect(steps()).toHaveLength(2);
  });
});

describe("a published report", () => {
  it("shows only the steps that have meaning yet", () => {
    render(<CaseTimeline status="published" createdAt={FILED} reviewedAt={REVIEWED} />);

    expect(screen.getByText("Reviewed and published")).toBeInTheDocument();
    // No link exists, so no step implies one is expected.
    expect(screen.queryByText("Linked to another report")).not.toBeInTheDocument();
    expect(steps()).toHaveLength(2);
  });

  it("adds the link step once there is actually a link", () => {
    render(
      <CaseTimeline status="published" createdAt={FILED} reviewedAt={REVIEWED} hasMatch />,
    );

    expect(screen.getByText("Linked to another report")).toBeInTheDocument();
    expect(screen.getByText("Case closed")).toBeInTheDocument();
    expect(steps()).toHaveLength(4);
  });
});

describe("a matched and a resolved case", () => {
  it("marks the link as the current step while it is unconfirmed", () => {
    render(<CaseTimeline status="matched" createdAt={FILED} reviewedAt={REVIEWED} hasMatch />);

    expect(screen.getByText("Linked to another report")).toBeInTheDocument();
    expect(screen.getByText(/not yet confirmed/i)).toBeInTheDocument();
    expect(screen.getByText("— current step")).toBeInTheDocument();
  });

  it("reaches the closing step when resolved, and says the photographs are gone", () => {
    render(<CaseTimeline status="resolved" createdAt={FILED} reviewedAt={REVIEWED} hasMatch />);

    expect(screen.getByText("Case closed")).toBeInTheDocument();
    expect(screen.getByText(/photographs deleted/i)).toBeInTheDocument();
  });
});

describe("dates", () => {
  it("dates the filing, which is always known", () => {
    render(<CaseTimeline status="published" createdAt={FILED} reviewedAt={REVIEWED} />);
    // Rendered as a <time> with a machine-readable value, not just as text.
    const filed = screen.getByText("1 Aug 2026");
    expect(filed.tagName).toBe("TIME");
    expect(filed).toHaveAttribute("dateTime", FILED);
  });

  it("omits the review date entirely when the viewer is not entitled to it", () => {
    // A stranger gets the owner projection's `reviewedAt` as null. The step
    // still appears; it simply carries no date rather than an invented one.
    render(<CaseTimeline status="published" createdAt={FILED} reviewedAt={null} />);

    expect(screen.getByText("Reviewed and published")).toBeInTheDocument();
    expect(screen.getByText("1 Aug 2026")).toBeInTheDocument();
    expect(screen.queryByText("2 Aug 2026")).not.toBeInTheDocument();
  });
});

describe("markup", () => {
  it("is an ordered list, so position in the sequence is announced", () => {
    render(<CaseTimeline status="published" createdAt={FILED} reviewedAt={REVIEWED} hasMatch />);
    // A pile of divs would read as four unrelated blocks.
    expect(screen.getByRole("list").tagName).toBe("OL");
  });
});
