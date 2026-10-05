"use client";

import { LayoutGrid, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Progress } from "@/components/ui/progress";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { ShowcaseSection, Specimen, Variant } from "./specimen";

export function StatesShowcase() {
  return (
    <ShowcaseSection
      id="states"
      title="Status and states"
      description="Colour is never the only signal. Every status carries a glyph, a dot or its own label, so the meaning survives greyscale and colour vision deficiency."
    >
      <Specimen title="Badges" note="Bordered chips for categorisation." inline>
        <Badge>Neutral</Badge>
        <Badge tone="info">In build</Badge>
        <Badge tone="success">Launched</Badge>
        <Badge tone="warning">14 days to deliver</Badge>
        <Badge tone="danger">Overdue</Badge>
        <Badge tone="info" dot pulse>
          Live
        </Badge>
      </Specimen>

      <Specimen
        title="Status indicators"
        note="For live state rather than categorisation. The label is the signal; the dot reinforces it."
        inline
      >
        <StatusIndicator>Draft</StatusIndicator>
        <StatusIndicator tone="info" pulse emphasis>
          Build in progress
        </StatusIndicator>
        <StatusIndicator tone="success" emphasis>
          Approved
        </StatusIndicator>
        <StatusIndicator tone="warning" emphasis>
          Deadline at risk
        </StatusIndicator>
        <StatusIndicator tone="danger" emphasis>
          Deadline missed
        </StatusIndicator>
      </Specimen>

      <Specimen
        title="Alerts"
        note="Inline messages. A glyph accompanies the colour in every tone."
      >
        <Callout tone="info" title="Your countdown has not started">
          It begins once your required assets are submitted and the build is officially
          started.
        </Callout>
        <Callout tone="success" title="Preview approved">
          We will deploy to your domain within one working day.
        </Callout>
        <Callout tone="warning" title="This exceeds a 5-Day Build">
          Four user types and live tracking were detected. A larger build applies.
        </Callout>
        <Callout
          tone="danger"
          title="Payment could not be completed"
          live
          action={
            <Button size="sm" variant="secondary">
              Try again
            </Button>
          }
        >
          Your card was declined. No charge was made.
        </Callout>
      </Specimen>

      <Specimen
        title="Progress"
        note="Sized with the logical inline-size rather than a transform, so the bar fills from the correct edge under RTL. The value text is what a screen reader announces."
      >
        <Progress
          value={60}
          label="Build progress"
          caption="Build progress"
          valueText="3 of 5 days"
        />
        <Progress
          value={85}
          tone="warning"
          label="Time remaining"
          caption="Deadline approaching"
          valueText="1 day remaining"
        />
        <Progress
          value={100}
          tone="danger"
          label="Deadline"
          caption="Deadline missed"
          valueText="2 days over"
        />
        <Progress value={null} label="Deploying" caption="Deploying" size="sm" />
      </Specimen>

      <Specimen
        title="Loading"
        note="Shapes mirror the real content so nothing reflows when data lands."
        inline
      >
        <Variant label="spinner sm">
          <Spinner size="sm" />
        </Variant>
        <Variant label="spinner md">
          <Spinner size="md" />
        </Variant>
        <Variant label="spinner lg">
          <Spinner size="lg" label="Loading" />
        </Variant>
      </Specimen>

      <Specimen title="Skeletons">
        <div className="flex w-full max-w-md flex-col gap-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-9 w-24" />
          <SkeletonText lines={3} />
        </div>
      </Specimen>

      <Specimen
        title="Empty state"
        note="Names the next action rather than reporting absence. The build wall genuinely uses this today."
      >
        <EmptyState
          icon={<LayoutGrid className="size-6" />}
          title="The first builds are in production"
          description="Completed builds appear here with their scope and delivery time once they launch."
          action={<Button variant="secondary">Be one of the first</Button>}
        />
      </Specimen>

      <Specimen
        title="Error state"
        note="Distinct from empty: this means something failed, not that there is nothing yet. Carries the correlation id from the API envelope."
      >
        <ErrorState
          title="We could not load your builds"
          description="This has been logged. Trying again usually resolves it."
          reference="req_8e3d0e1d-aa10-4d00"
          action={
            <Button variant="secondary" startIcon={<RefreshCw className="size-4" />}>
              Try again
            </Button>
          }
        />
      </Specimen>
    </ShowcaseSection>
  );
}
