"use client";

import { Clock, Gauge, ShieldCheck } from "lucide-react";

import { FeatureCard } from "@/components/product/feature-card";
import { PricingCard } from "@/components/product/pricing-card";
import { ProjectCard } from "@/components/product/project-card";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/stepper";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableMessageRow,
  TableRow,
  TableRowHeader,
} from "@/components/ui/table";
import { Timeline } from "@/components/ui/timeline";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { fromMajorUnits } from "@/lib/pricing/money";
import { ShowcaseSection, Specimen } from "./specimen";

const INVOICES = [
  { id: "INV-0042", project: "Northside Bakery", amount: "$400.00", status: "Paid" },
  { id: "INV-0043", project: "Harbour Clinic", amount: "$1,200.00", status: "Paid" },
  { id: "INV-0044", project: "Vale Logistics", amount: "$2,400.00", status: "Due" },
] as const;

const STEPS = [
  { id: "idea", label: "Idea", description: "Describe it" },
  { id: "configure", label: "Configure", description: "Pick features" },
  { id: "price", label: "Price", description: "Fixed quote" },
  { id: "pay", label: "Pay", description: "Checkout" },
  { id: "build", label: "Build", description: "Clock starts" },
];

export function DataDisplayShowcase() {
  return (
    <ShowcaseSection
      id="data-display"
      title="Data display"
      description="Tables, sequences and the product composites built from the primitives above."
    >
      <Specimen
        title="Table"
        note="A real <table>, so row and column relationships are announced. On narrow screens it scrolls horizontally rather than collapsing into cards, because comparison across rows is why a table was chosen. The scroll container is focusable so it can be reached by keyboard."
      >
        <Table label="Invoices" caption="Invoices issued in the last 30 days.">
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Project</TableHead>
              <TableHead numeric>Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {INVOICES.map((invoice) => (
              <TableRow key={invoice.id} interactive>
                <TableRowHeader>
                  <span className="font-mono text-caption">{invoice.id}</span>
                </TableRowHeader>
                <TableCell>{invoice.project}</TableCell>
                <TableCell numeric>{invoice.amount}</TableCell>
                <TableCell>
                  <StatusIndicator
                    tone={invoice.status === "Paid" ? "success" : "warning"}
                  >
                    {invoice.status}
                  </StatusIndicator>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Specimen>

      <Specimen
        title="Table — empty"
        note="The zero case lives inside the table, keeping the headers visible."
      >
        <Table label="Change requests">
          <TableHeader>
            <TableRow>
              <TableHead>Request</TableHead>
              <TableHead>Raised</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableMessageRow colSpan={3}>
              No change requests on this build yet.
            </TableMessageRow>
          </TableBody>
        </Table>
      </Specimen>

      <Specimen
        title="Stepper"
        note="Position within a known sequence. Steps are not buttons: letting someone jump ahead is a validation problem disguised as navigation. Completed steps show a check rather than their number."
      >
        <Stepper
          steps={STEPS}
          current={2}
          label="Configurator steps"
          statusLabel={(status) =>
            status === "complete"
              ? "completed"
              : status === "current"
                ? "current step"
                : "not started"
          }
        />
      </Specimen>

      <Specimen
        title="Timeline"
        note="A record of what happened, where a stepper would be wrong because these events are not a fixed sequence. Timestamps keep a machine-readable value in the datetime attribute."
      >
        <Timeline
          entries={[
            {
              id: "1",
              title: "Preview updated",
              description: "Menu and ordering flow are now on the preview URL.",
              dateTime: "2026-10-05T09:12:00Z",
              displayTime: "Today, 09:12",
              tone: "accent",
              active: true,
            },
            {
              id: "2",
              title: "Build started",
              description: "Countdown began. 5 days guaranteed.",
              dateTime: "2026-10-03T08:00:00Z",
              displayTime: "3 Oct, 08:00",
              tone: "success",
            },
            {
              id: "3",
              title: "Assets received",
              dateTime: "2026-10-02T16:40:00Z",
              displayTime: "2 Oct, 16:40",
            },
            {
              id: "4",
              title: "Payment completed",
              dateTime: "2026-10-02T11:05:00Z",
              displayTime: "2 Oct, 11:05",
            },
          ]}
        />
      </Specimen>

      <Specimen
        title="Pricing cards"
        note="Presentational only; the commercial rules live in the scope engine. A floor price always renders its 'from' qualifier, so a starting figure cannot be shown as a fixed one."
      >
        <div className="grid gap-5 lg:grid-cols-3">
          <PricingCard
            name="Website"
            summary="Marketing sites, landing pages and portfolios."
            price={fromMajorUnits(400)}
            intlTag="en-CA"
            priceModel="fixed"
            fromLabel="from"
            deliveryLabel="5 days to deliver"
            features={[
              "A defined page count",
              "Responsive layouts",
              "Search fundamentals",
            ]}
            action={
              <Button fullWidth variant="secondary">
                Configure a website
              </Button>
            }
          />
          <PricingCard
            name="Business system"
            summary="Dashboards, booking, inventory and internal tools."
            price={fromMajorUnits(400)}
            intlTag="en-CA"
            priceModel="from"
            fromLabel="from"
            deliveryLabel="5 days to deliver"
            featured
            featuredLabel="Most common"
            features={["Everything in Website", "A single user type", "Admin dashboard"]}
            action={<Button fullWidth>Configure a system</Button>}
          />
          <PricingCard
            name="Beyond the ladder"
            summary="Multi-party payouts, live tracking or dispatch logistics."
            price={null}
            quotePlaceholder="Custom quote"
            intlTag="en-CA"
            priceModel="fixed"
            fromLabel="from"
            deliveryLabel="Timeline quoted"
            deliveryWarning
            features={["Scope assessed first", "Written quotation", "No published price"]}
            action={
              <Button fullWidth variant="secondary">
                Request a quote
              </Button>
            }
          />
        </div>
      </Specimen>

      <Specimen
        title="Feature cards"
        note="Icon, heading, one line. No gradients, no oversized rounding."
      >
        <div className="grid gap-5 sm:grid-cols-3">
          <FeatureCard
            icon={Clock}
            title="Deadline guarantee"
            description="Miss it and you choose: cancel for a full refund, or continue and take 30% back."
          />
          <FeatureCard
            icon={ShieldCheck}
            title="Written scope"
            description="Agreed before any work starts, so the price cannot move afterwards."
          />
          <FeatureCard
            icon={Gauge}
            title="Honest assessment"
            description="If an idea exceeds a 5-Day Build, the configurator says so before you pay."
          />
        </div>
      </Specimen>

      <Specimen
        title="Project cards"
        note="Shared by the public build wall and the dashboard. The whole card is one link via a stretched anchor, keeping a single tab stop and a single announced name."
      >
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <ProjectCard
            title="Northside Bakery"
            buildType="Website"
            scopeTier="5-Day Build"
            status={{ tone: "success", label: "Launched" }}
            delivery="Delivered in 4 days"
            href="/"
            media={<div className="size-full bg-sunken" />}
          />
          <ProjectCard
            title="Harbour Clinic"
            buildType="System"
            scopeTier="Extended Build"
            status={{ tone: "info", label: "In build", pulse: true }}
            delivery="Day 3 of 12"
            href="/"
            media={<div className="size-full bg-sunken" />}
          />
          <ProjectCard
            title="Vale Logistics"
            buildType="Mobile app"
            scopeTier="Custom quote"
            status={{ tone: "warning", label: "Awaiting assets" }}
            href="/"
            media={<div className="size-full bg-sunken" />}
          />
        </div>
      </Specimen>
    </ShowcaseSection>
  );
}
