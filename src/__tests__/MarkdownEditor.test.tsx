import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MarkdownEditor } from "../ui/markdown-editor";

/**
 * The editor is a plain textarea (the value IS the markdown source) with a
 * read-only formatted overlay pinned on top of it — not a WYSIWYG editor, so
 * what matters here is that the raw text always round-trips unchanged and
 * that the overlay renders the expected tags, not any particular pixel
 * layout.
 */

describe("MarkdownEditor", () => {
  it("renders the raw value in the textarea, untouched", () => {
    render(<MarkdownEditor value="**bold** text" onChange={vi.fn()} />);
    expect(screen.getByRole("textbox")).toHaveValue("**bold** text");
  });

  it("emits the raw text on input, not the formatted HTML", () => {
    const onChange = vi.fn();
    render(<MarkdownEditor value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "**hi**" } });
    expect(onChange).toHaveBeenLastCalledWith("**hi**");
  });

  it("renders bold/italic/strike/code as real tags in the overlay", () => {
    const { container } = render(
      <MarkdownEditor value="**bold** *italic* ~~gone~~ `code`" onChange={vi.fn()} />,
    );
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("em")?.textContent).toBe("italic");
    expect(container.querySelector("del")?.textContent).toBe("gone");
    expect(container.querySelector("code")?.textContent).toBe("code");
  });

  it("does not treat a mid-word underscore as an italic delimiter", () => {
    const { container } = render(<MarkdownEditor value="snake_case_name" onChange={vi.fn()} />);
    expect(container.querySelector("em")).toBeNull();
  });

  it("uses a placeholder when empty", () => {
    render(<MarkdownEditor value="" onChange={vi.fn()} placeholder="Describe it..." />);
    expect(screen.getByPlaceholderText("Describe it...")).toBeInTheDocument();
  });

  it("disables the textarea when disabled is passed", () => {
    render(<MarkdownEditor value="" onChange={vi.fn()} disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});
