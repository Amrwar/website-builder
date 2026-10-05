"use client";

import { useState } from "react";

import { ArrowRight, Download, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ChoiceCard } from "@/components/ui/choice-card";
import { Field } from "@/components/ui/field";
import { CharacterCount, Input, Textarea } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShowcaseSection, Specimen, Variant } from "./specimen";

const IDEA_LIMIT = 300;

export function ControlsShowcase() {
  const [idea, setIdea] = useState("");
  const [buildType, setBuildType] = useState("website");
  const [features, setFeatures] = useState<string[]>(["cms_editing"]);
  const [loading, setLoading] = useState(false);

  function toggleFeature(key: string) {
    setFeatures((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  async function simulatePending() {
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1600));
    setLoading(false);
  }

  return (
    <ShowcaseSection
      id="controls"
      title="Controls"
      description="Every control is a native element underneath. Keyboard behaviour, form participation and assistive-technology semantics come from the platform rather than from re-implemented ARIA."
    >
      <Specimen
        title="Button variants"
        note="Primary is ink, not a saturated accent. Accent is reserved for the single highest-intent action on a view; danger for irreversible actions only."
        inline
      >
        <Variant label="primary">
          <Button>Start a build</Button>
        </Variant>
        <Variant label="secondary">
          <Button variant="secondary">See what&apos;s included</Button>
        </Variant>
        <Variant label="ghost">
          <Button variant="ghost">Cancel</Button>
        </Variant>
        <Variant label="accent">
          <Button variant="accent">Approve build</Button>
        </Variant>
        <Variant label="danger">
          <Button variant="danger" startIcon={<Trash2 className="size-4" />}>
            Delete project
          </Button>
        </Variant>
      </Specimen>

      <Specimen title="Button sizes and icons" inline>
        <Variant label="sm">
          <Button size="sm">Small</Button>
        </Variant>
        <Variant label="md">
          <Button size="md">Medium</Button>
        </Variant>
        <Variant label="lg">
          <Button size="lg" endIcon={<ArrowRight className="rtl-flip size-4" />}>
            Large
          </Button>
        </Variant>
        <Variant label="with start icon">
          <Button variant="secondary" startIcon={<Download className="size-4" />}>
            Download invoice
          </Button>
        </Variant>
      </Specimen>

      <Specimen
        title="Button states"
        note="Loading keeps the rendered width so the layout does not shift mid-request, and the button stays focusable rather than being disabled, which would drop the keyboard position."
        inline
      >
        <Variant label="disabled">
          <Button disabled>Unavailable</Button>
        </Variant>
        <Variant label="loading (click)">
          <Button loading={loading} loadingLabel="Submitting" onClick={simulatePending}>
            Submit for review
          </Button>
        </Variant>
        <Variant label="full width">
          <div className="w-64">
            <Button fullWidth variant="secondary" startIcon={<Plus className="size-4" />}>
              Add a feature
            </Button>
          </div>
        </Variant>
      </Specimen>

      <Specimen
        title="Field: label, description, error"
        note="Field owns id generation and the aria-describedby / aria-invalid wiring. The error is announced assertively because it results from the user's own action."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Project name" description="Shown to you only, never published.">
            <Input placeholder="Northside Bakery" />
          </Field>

          <Field
            label="Domain"
            error="That domain is already connected to another build."
            required
          >
            <Input defaultValue="northside.example" />
          </Field>

          <Field
            label="Disabled"
            description="Set automatically once the build starts."
            disabled
          >
            <Input defaultValue="Locked while in build" />
          </Field>

          <Field label="Build type">
            <Select value={buildType} onValueChange={setBuildType}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a build type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="website">Website</SelectItem>
                <SelectItem value="system">Business system</SelectItem>
                <SelectItem value="mobileApp">Mobile application</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </Specimen>

      <Specimen
        title="Textarea with character count"
        note="The counter only enters a live region near the limit. Announcing every keystroke would make the field unusable with a screen reader."
      >
        <Field
          label="Describe your idea"
          description="Plain words are fine. The scope engine reads this and shows you which rules it matched."
        >
          <Textarea
            value={idea}
            maxLength={IDEA_LIMIT}
            onChange={(event) => setIdea(event.target.value)}
            placeholder="I want a restaurant system where customers order food, pay online…"
          />
        </Field>
        <CharacterCount
          value={idea}
          max={IDEA_LIMIT}
          label={(remaining) => `${remaining} characters remaining`}
        />
      </Specimen>

      <Specimen
        title="Checkbox"
        note="A real input, visually hidden but focusable; the painted box follows peer-checked."
      >
        <div className="flex flex-col gap-3">
          <Checkbox
            label="Content management"
            description="Edit page content yourself after launch."
            checked={features.includes("cms_editing")}
            onChange={() => toggleFeature("cms_editing")}
          />
          <Checkbox
            label="Online payments"
            description="Through a hosted checkout page."
            checked={features.includes("hosted_checkout")}
            onChange={() => toggleFeature("hosted_checkout")}
          />
          <Checkbox label="Unavailable for this build type" disabled />
        </div>
      </Specimen>

      <Specimen
        title="Choice cards"
        note="Radio members of one group get arrow-key roving focus from the browser. Selection is shown by border and surface, never by colour alone."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <ChoiceCard
            name="showcase-build-type"
            value="website"
            title="Website"
            description="Marketing sites and landing pages."
            meta="400 CAD"
            checked={buildType === "website"}
            onChange={() => setBuildType("website")}
          />
          <ChoiceCard
            name="showcase-build-type"
            value="system"
            title="Business system"
            description="Dashboards, booking, inventory."
            meta="from 400 CAD"
            checked={buildType === "system"}
            onChange={() => setBuildType("system")}
          />
          <ChoiceCard
            name="showcase-build-type"
            value="mobileApp"
            title="Mobile app"
            description="A constrained MVP."
            meta="600 CAD"
            checked={buildType === "mobileApp"}
            onChange={() => setBuildType("mobileApp")}
          />
        </div>
      </Specimen>
    </ShowcaseSection>
  );
}
