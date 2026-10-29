"use client";

import * as React from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  useComboboxAnchor,
} from "@/components/ui/combobox";

type MetadataComboboxProps = {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  onValueChange: (value: string) => void;
  placeholder?: string;
};

type MetadataTagsComboboxProps = {
  id: string;
  label: string;
  value: readonly string[];
  options: readonly string[];
  onValueChange: (value: string[]) => void;
};

function metadataOptions(options: readonly string[], selected: readonly string[], query: string) {
  const items = [...new Set([...options, ...selected].filter((item) => item !== ""))];
  const candidate = query.trim();
  const createdValue = candidate && !items.includes(candidate) ? candidate : null;
  if (createdValue !== null) items.push(createdValue);
  return { items, createdValue };
}

function matchesMetadataOption(option: string, query: string) {
  return option.toLowerCase().includes(query.trim().toLowerCase());
}

// Bubble after the primitive handles selection; an unhandled Enter must not save a surrounding form.
function containEnter(event: React.KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Enter") return;
  event.stopPropagation();
  if (event.target instanceof HTMLElement && event.target.closest("button")) return;
  if (!event.nativeEvent.isComposing && event.keyCode !== 229) event.preventDefault();
}

function MetadataOptions({ createdValue }: { createdValue: string | null }) {
  return (
    <>
      <ComboboxEmpty>Type to create a value.</ComboboxEmpty>
      <ComboboxList>
        {(option: string) => (
          <ComboboxItem key={option} value={option} className="break-words whitespace-normal">
            <span className="min-w-0 break-words">
              {option === createdValue ? <>Create “{option}”</> : option}
            </span>
          </ComboboxItem>
        )}
      </ComboboxList>
    </>
  );
}

export function MetadataCombobox({
  id,
  label,
  value,
  options,
  onValueChange,
  placeholder = "Choose or create a value",
}: MetadataComboboxProps) {
  const [query, setQuery] = React.useState(value);
  const [previousValue, setPreviousValue] = React.useState(value);
  const inputRef = React.useRef<HTMLInputElement>(null);
  if (previousValue !== value) {
    setPreviousValue(value);
    setQuery(value);
  }
  const { items, createdValue } = metadataOptions(options, [value], query);

  return (
    <div className="space-y-1 text-sm" onKeyDown={containEnter}>
      <label htmlFor={id} className="text-muted-foreground">{label}</label>
      <Combobox<string>
        items={items}
        filter={matchesMetadataOption}
        value={value || null}
        onValueChange={(nextValue, details) => {
          // Search clearing and Escape keep metadata; the named Clear button removes it.
          if (nextValue === null) {
            details.cancel();
            if (details.reason === "escape-key") setQuery(value);
            return;
          }
          onValueChange(nextValue);
        }}
        inputValue={query}
        onInputValueChange={setQuery}
        autoHighlight
      >
        <ComboboxInput
          id={id}
          ref={inputRef}
          aria-label={label}
          placeholder={placeholder}
          showTrigger={false}
          className="w-full min-w-0"
        >
          <ComboboxTrigger
            aria-label={`Show ${label.toLowerCase()} options`}
            render={<Button type="button" variant="ghost" size="icon-xs" className="mr-1" />}
          />
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="mr-1"
              aria-label={`Clear ${label.toLowerCase()}`}
              onClick={() => {
                setQuery("");
                onValueChange("");
                inputRef.current?.focus();
              }}
            >
              <X aria-hidden="true" />
            </Button>
          ) : null}
        </ComboboxInput>
        <ComboboxContent className="min-w-0 data-[chips=true]:min-w-0">
          <MetadataOptions createdValue={createdValue} />
        </ComboboxContent>
      </Combobox>
    </div>
  );
}

export function MetadataTagsCombobox({
  id,
  label,
  value,
  options,
  onValueChange,
}: MetadataTagsComboboxProps) {
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const anchor = useComboboxAnchor();
  const { items, createdValue } = metadataOptions(options, value, query);

  return (
    <div className="space-y-1 text-sm" onKeyDown={containEnter}>
      <label htmlFor={id} className="text-muted-foreground">{label}</label>
      <Combobox<string, true>
        multiple
        items={items}
        filter={matchesMetadataOption}
        value={[...value]}
        onValueChange={(nextValue, details) => {
          if (details.reason === "escape-key") {
            details.cancel();
            setQuery("");
            return;
          }
          onValueChange(nextValue);
          setQuery("");
        }}
        inputValue={query}
        onInputValueChange={setQuery}
        autoHighlight
      >
        <ComboboxChips ref={anchor} className="min-w-0 rounded-2xl">
          {value.map((tag, index) => (
            <ComboboxChip
              key={`${index}:${tag}`}
              showRemove={false}
              className="h-auto max-w-full min-w-0 py-1 whitespace-normal"
            >
              <span className="min-w-0 break-words">{tag}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="-my-1 -mr-1"
                aria-label={`Remove ${tag} from ${label.toLowerCase()}`}
                onKeyDown={(event) => {
                  // Let the native button activate before the chip's Enter/Space handler.
                  if (event.key === "Enter" || event.key === " ") event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onValueChange(value.filter((_, selectedIndex) => selectedIndex !== index));
                  inputRef.current?.focus();
                }}
              >
                <X aria-hidden="true" />
              </Button>
            </ComboboxChip>
          ))}
          <ComboboxChipsInput
            id={id}
            ref={inputRef}
            aria-label={label}
            placeholder="Search or create a tag"
            className="min-w-24 py-1"
          />
          <ComboboxTrigger
            aria-label={`Show ${label.toLowerCase()} options`}
            render={<Button type="button" variant="ghost" size="icon-xs" />}
          />
        </ComboboxChips>
        <ComboboxContent anchor={anchor} className="min-w-0 data-[chips=true]:min-w-0">
          <MetadataOptions createdValue={createdValue} />
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
