import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminAnnouncements, { type AdminAnnouncement } from "./AdminAnnouncements";

const announcement: AdminAnnouncement = { id: "notice-1", title: "Mock schedule", message: "The mock test opens Friday.", startsAt: "2026-11-10T08:00:00.000Z", expiresAt: null, createdAt: "2026-11-10T08:00:00.000Z", _count: { views: 12 } };

afterEach(() => vi.unstubAllGlobals());

describe("AdminAnnouncements", () => {
  it("renders an empty history and the announcement composer", () => {
    render(<AdminAnnouncements announcements={[]} title="" message="" expiry="" publishAt="" busy={false} onTitleChange={vi.fn()} onMessageChange={vi.fn()} onExpiryChange={vi.fn()} onPublishAtChange={vi.fn()} onCreate={vi.fn()} onRefresh={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Announcements" })).toBeTruthy();
    expect(screen.getByText("No announcements published yet.")).toBeTruthy();
    expect(screen.getByLabelText("Title")).toBeTruthy();
    expect(screen.getByLabelText("Message")).toHaveAttribute("maxLength", "4000");
    expect(screen.getByLabelText(/Publish date and time/)).toBeTruthy();
    expect(screen.getByLabelText(/Expiry date and time/)).toBeTruthy();
  });

  it("requires confirmation before deleting an announcement", () => {
    const onDelete = vi.fn();
    const confirmMock = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", confirmMock);
    render(<AdminAnnouncements announcements={[announcement]} title="" message="" expiry="" publishAt="" busy={false} onTitleChange={vi.fn()} onMessageChange={vi.fn()} onExpiryChange={vi.fn()} onPublishAtChange={vi.fn()} onCreate={vi.fn()} onRefresh={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirmMock).toHaveBeenCalledWith("Delete this announcement? Students will no longer see it.");
    expect(onDelete).not.toHaveBeenCalled();
    confirmMock.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith("notice-1");
  });

  it("delegates field changes, form submission and refresh", () => {
    const onTitleChange = vi.fn(), onMessageChange = vi.fn(), onExpiryChange = vi.fn(), onPublishAtChange = vi.fn(), onCreate = vi.fn(), onRefresh = vi.fn();
    render(<AdminAnnouncements announcements={[]} title="" message="" expiry="" publishAt="" busy={false} onTitleChange={onTitleChange} onMessageChange={onMessageChange} onExpiryChange={onExpiryChange} onPublishAtChange={onPublishAtChange} onCreate={onCreate} onRefresh={onRefresh} onDelete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Notice" } });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Details" } });
    fireEvent.change(screen.getByLabelText(/Publish date and time/), { target: { value: "2026-11-20T08:00" } });
    fireEvent.change(screen.getByLabelText(/Expiry date and time/), { target: { value: "2026-11-20T09:00" } });
    fireEvent.submit(screen.getByRole("button", { name: "Publish announcement" }).closest("form")!);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(onTitleChange).toHaveBeenCalledWith("Notice");
    expect(onMessageChange).toHaveBeenCalledWith("Details");
    expect(onPublishAtChange).toHaveBeenCalledWith("2026-11-20T08:00");
    expect(onExpiryChange).toHaveBeenCalledWith("2026-11-20T09:00");
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
