import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StudentAnnouncementPreview from "./StudentAnnouncementPreview";

describe("StudentAnnouncementPreview", () => {
  it("renders the latest announcement and its total count", () => {
    render(
      <StudentAnnouncementPreview
        announcement={{
          title: "ECET mock exam schedule",
          message: "The mock exam starts tomorrow at 10 AM.",
          publishedAt: "2026-11-08T08:00:00.000Z",
        }}
        announcementCount={3}
        onViewAll={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Latest announcement" })).toBeInTheDocument();
    expect(screen.getByText("ECET mock exam schedule")).toBeInTheDocument();
    expect(screen.getByText("The mock exam starts tomorrow at 10 AM.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /View all \(3\)/ })).toBeInTheDocument();
  });

  it("delegates navigation to the parent when View all is selected", () => {
    const onViewAll = vi.fn();
    render(
      <StudentAnnouncementPreview
        announcement={{ title: "Notice", message: "Message", publishedAt: "2026-11-08T08:00:00.000Z" }}
        announcementCount={1}
        onViewAll={onViewAll}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /View all \(1\)/ }));
    expect(onViewAll).toHaveBeenCalledTimes(1);
  });
});
