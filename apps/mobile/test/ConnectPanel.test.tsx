import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConnectPanel } from "../src/components/ConnectPanel";

const base = {
  lanUrls: ["http://192.168.1.20:4545/", "http://10.0.0.5:4545/"],
  selectedUrl: "http://192.168.1.20:4545/",
  qrImage: "data:image/svg+xml;charset=utf-8,qr",
  overlayUrl: "http://localhost:4545/overlay",
  copyStatus: "",
  onSelectUrl: () => {},
  onCopyOverlayUrl: () => {},
};

describe("ConnectPanel", () => {
  it("shows the QR code and the URL to open on the phone", () => {
    render(<ConnectPanel {...base} />);
    expect(screen.getByRole("heading", { name: "Connect your phone" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "QR code for http://192.168.1.20:4545/" })).toHaveAttribute("src", base.qrImage);
    expect(screen.getAllByText("http://192.168.1.20:4545/").length).toBeGreaterThan(0);
  });

  it("lets the user pick another network address when there are several", async () => {
    const onSelectUrl = vi.fn();
    render(<ConnectPanel {...base} onSelectUrl={onSelectUrl} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Network address" }), "http://10.0.0.5:4545/");
    expect(onSelectUrl).toHaveBeenCalledWith("http://10.0.0.5:4545/");
  });

  it("hides the address selector when there is only one", () => {
    render(<ConnectPanel {...base} lanUrls={[base.selectedUrl]} />);
    expect(screen.queryByRole("combobox", { name: "Network address" })).not.toBeInTheDocument();
  });

  it("explains what to do when the computer is not on a network", () => {
    render(<ConnectPanel {...base} lanUrls={[]} selectedUrl="" qrImage={null} />);
    expect(screen.getByText(/connect this computer to the same Wi-Fi/i)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("copies the OBS URL and reports the result", async () => {
    const onCopyOverlayUrl = vi.fn();
    render(<ConnectPanel {...base} copyStatus="Copied!" onCopyOverlayUrl={onCopyOverlayUrl} />);
    await userEvent.click(screen.getByRole("button", { name: "Copy OBS URL" }));
    expect(onCopyOverlayUrl).toHaveBeenCalled();
    expect(screen.getByText("http://localhost:4545/overlay")).toBeInTheDocument();
    expect(screen.getByText("Copied!")).toBeInTheDocument();
  });
});
