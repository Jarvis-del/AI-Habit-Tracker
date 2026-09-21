import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Login from "./Login.jsx";

const login = vi.fn();
vi.mock("../context/AuthContext.jsx", () => ({ useAuth: () => ({ login }) }));

const setup = () =>
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<p>DASHBOARD</p>} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  login.mockClear();
});

describe("Login page", () => {
  it("renders an accessible form (regression: the whole page used to be blank)", () => {
    setup();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
  });

  it("logs in and goes to the dashboard", async () => {
    login.mockResolvedValue({});
    setup();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "a@b.co");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(login).toHaveBeenCalledWith("a@b.co", "password123");
    expect(await screen.findByText("DASHBOARD")).toBeInTheDocument();
  });

  it("shows the server's error and stays on the page", async () => {
    login.mockRejectedValue(Object.assign(new Error("Request failed with status code 401"), { response: { status: 401, data: { message: "Invalid email or password" } } }));
    setup();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "a@b.co");
    await user.type(screen.getByLabelText("Password"), "wrongpass1");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
    expect(screen.queryByText("DASHBOARD")).not.toBeInTheDocument();
  });

  it("disables the button while the request is in flight", async () => {
    let resolve;
    login.mockReturnValue(new Promise((r) => (resolve = r)));
    setup();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "a@b.co");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Logging in/ })).toBeDisabled());
    resolve({});
  });
});
