"use client";

import { useState } from "react";

import { Ellipsis, Info, PanelRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Pagination } from "@/components/ui/pagination";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { ShowcaseSection, Specimen, Variant } from "./specimen";

export function OverlaysShowcase() {
  const [page, setPage] = useState(3);
  const { toast } = useToast();

  return (
    <ShowcaseSection
      id="navigation-overlays"
      title="Navigation and overlays"
      description="Focus trapping, focus return, Escape handling, roving focus and type-ahead are provided by Radix. Only the appearance is ours."
    >
      <Specimen
        title="Tabs"
        note="Tab enters the strip once, then arrow keys move between tabs and Home/End jump to the ends. Direction-aware under RTL."
      >
        <Tabs defaultValue="scope" className="w-full">
          <TabsList>
            <TabsTrigger value="scope">Scope</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
            <TabsTrigger value="disabled" disabled>
              Invoices
            </TabsTrigger>
          </TabsList>
          <TabsContent value="scope">
            <p className="text-body-sm text-secondary">
              Seven capabilities detected; this build exceeds the 5-Day tier.
            </p>
          </TabsContent>
          <TabsContent value="timeline">
            <p className="text-body-sm text-secondary">Countdown started 2 days ago.</p>
          </TabsContent>
          <TabsContent value="files">
            <p className="text-body-sm text-secondary">Four brand assets uploaded.</p>
          </TabsContent>
        </Tabs>
      </Specimen>

      <Specimen title="Breadcrumbs" note="The last item is the current page, not a link.">
        <Breadcrumbs
          label="Breadcrumb"
          items={[
            { label: "Dashboard", href: "/" },
            { label: "Builds", href: "/" },
            { label: "Northside Bakery" },
          ]}
        />
      </Specimen>

      <Specimen
        title="Pagination"
        note="Page numbers collapse with ellipses to keep a fixed width. On phones only previous/next and a position summary remain, since a row of numbers is below a comfortable touch target."
      >
        <Pagination
          page={page}
          pageCount={24}
          onPageChange={setPage}
          label="Build pages"
          previousLabel="Previous"
          nextLabel="Next"
          pageLabel={(n) => `Page ${n}`}
          summaryLabel={(current, total) => `Page ${current} of ${total}`}
        />
      </Specimen>

      <Specimen title="Dialog, drawer, menu, tooltip" inline>
        <Variant label="dialog">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Open dialog</Button>
            </DialogTrigger>
            <DialogContent
              title="Request a change"
              description="Changes within the agreed scope do not affect your delivery date."
              closeLabel="Close"
              footer={
                <>
                  <Button variant="ghost">Cancel</Button>
                  <Button>Send request</Button>
                </>
              }
            >
              <p>
                Describe what you would like adjusted. We will confirm whether it sits
                inside the scope you agreed before any work starts.
              </p>
            </DialogContent>
          </Dialog>
        </Variant>

        <Variant label="confirm (destructive)">
          <ConfirmDialog
            trigger={<Button variant="danger">Cancel build</Button>}
            title="Cancel this build?"
            description="This releases your slot and begins the refund. It cannot be undone."
            confirmLabel="Cancel build"
            cancelLabel="Keep building"
            closeLabel="Close"
            destructive
            onConfirm={async () => {
              await new Promise((resolve) => setTimeout(resolve, 1200));
              toast({
                title: "Build cancelled",
                description: "A full refund has been started.",
                tone: "success",
              });
            }}
          />
        </Variant>

        <Variant label="drawer">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary" startIcon={<PanelRight className="size-4" />}>
                Open drawer
              </Button>
            </SheetTrigger>
            <SheetContent title="Build details" closeLabel="Close">
              <p className="text-body-sm text-secondary">
                Anchored to the inline-end edge, so it opens from the right in English and
                French and from the left in Arabic.
              </p>
            </SheetContent>
          </Sheet>
        </Variant>

        <Variant label="dropdown">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" aria-label="Project actions">
                <Ellipsis className="size-5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Project</DropdownMenuLabel>
              <DropdownMenuItem>View preview</DropdownMenuItem>
              <DropdownMenuItem>Download assets</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive>Cancel build</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Variant>

        <Variant label="tooltip">
          <Tooltip content="The countdown starts once your assets are in.">
            <Button variant="ghost" aria-label="About the countdown">
              <Info className="size-5" aria-hidden />
            </Button>
          </Tooltip>
        </Variant>
      </Specimen>

      <Specimen
        title="Toasts"
        note="The live region is mounted permanently. A region created at the same moment as its first message is not announced. Errors persist until dismissed; everything else auto-dismisses."
        inline
      >
        <Button
          variant="secondary"
          onClick={() => toast({ title: "Preview updated", tone: "success" })}
        >
          Success
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toast({
              title: "Deadline at risk",
              description: "This build has 1 day remaining.",
              tone: "warning",
            })
          }
        >
          Warning
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toast({
              title: "Upload failed",
              description: "The file exceeded 15 MB.",
              tone: "danger",
            })
          }
        >
          Error (persists)
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toast({
              title: "Change request sent",
              tone: "neutral",
              action: { label: "Undo", onClick: () => undefined },
            })
          }
        >
          With action
        </Button>
      </Specimen>
    </ShowcaseSection>
  );
}
