import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChangePassword, { validateNewPassword } from "./ChangePassword.jsx";

const changePassword = vi.fn();
const logoutEverywhere = vi.fn();
vi.mock("../services/authService.js", () => ({ authService: { changePassword: (...a) => changePassword(...a) } }));
vi.mock("../context/AuthContext.jsx", () => ({ useAuth: () => ({ logoutEverywhere }) }));

beforeEach(() => {
  changePassword.mockClear();
  logoutEverywhere.mockClear();
});

describe("validateNewPassword", () => {
  it.each([
    ["short1", /at least 8/],
    ["onlyletters", /letter and a number/],
    ["12345678", /letter and a number/],
  ])("rejects %s", (pw, msg) => expect(validateNewPassword(pw)).toMatch(msg));
  it("accepts a valid password", () => expect(validateNewPassword("goodpass123")).toBe(""));
});

describe("ChangePassword dialog", () => {
  const fill = async (user, cur, next, confirm) => {
    await user.type(screen.getByLabelText("Current password"), cur);
    await user.type(screen.getByLabelText(/^New password/), next);
    await user.type(screen.getByLabelText("Confirm new password"), confirm);
    await user.click(screen.getByRole("button", { name: "Change password" }));
  };

  it("blocks weak or mismatched passwords before calling the API", async () => {
    render(<ChangePassword onClose={() => {}} />);
    const user = userEvent.setup();
    await fill(user, "oldpass123", "weak", "weak");
    expect(await screen.findByRole("alert")).toHaveTextContent(/at least 8/);
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("detects mismatched confirmation", async () => {
    render(<ChangePassword onClose={() => {}} />);
    await fill(userEvent.setup(), "oldpass123", "newpass123", "different123");
    expect(await screen.findByRole("alert")).toHaveTextContent(/don't match/);
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("submits and confirms success", async () => {
    changePassword.mockResolvedValue({ token: "t", message: "Password updated. Other devices were signed out." });
    render(<ChangePassword onClose={() => {}} />);
    await fill(userEvent.setup(), "oldpass123", "newpass123", "newpass123");
    expect(changePassword).toHaveBeenCalledWith({ currentPassword: "oldpass123", newPassword: "newpass123" });
    expect(await screen.findByRole("status")).toHaveTextContent(/Other devices were signed out/);
  });

  it("shows the server's error for a wrong current password", async () => {
    changePassword.mockRejectedValue({ response: { status: 400, data: { message: "Current password is incorrect" } } });
    render(<ChangePassword onClose={() => {}} />);
    await fill(userEvent.setup(), "wrongold1", "newpass123", "newpass123");
    expect(await screen.findByRole("alert")).toHaveTextContent("Current password is incorrect");
  });

  it("offers 'sign out on all devices'", async () => {
    render(<ChangePassword onClose={() => {}} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /sign out on all devices/i }));
    expect(logoutEverywhere).toHaveBeenCalled();
  });
});
