import { BuildWall } from "@/components/home/build-wall";
import { ClosingCta } from "@/components/home/closing-cta";
import { Comparison } from "@/components/home/comparison";
import { ConfiguratorEntry } from "@/components/home/configurator-entry";
import { DesignForMe } from "@/components/home/design-for-me";
import { Faq } from "@/components/home/faq";
import { Guarantee } from "@/components/home/guarantee";
import { Hero } from "@/components/home/hero";
import { Journey } from "@/components/home/journey";
import { Maintenance } from "@/components/home/maintenance";
import { Portfolio } from "@/components/home/portfolio";
import { Products } from "@/components/home/products";
import { Referral } from "@/components/home/referral";
import { Scope } from "@/components/home/scope";
import { Testimonials } from "@/components/home/testimonials";

/**
 * Marketing home page.
 *
 * Composition only -- each section owns its own data access and copy, which
 * keeps this file a readable table of contents rather than a thousand-line
 * template.
 *
 * The order is the argument the page has to make, in the sequence a sceptical
 * buyer actually asks it:
 *
 *   what is this          hero, with the production line
 *   what does it cost     products
 *   which one is mine     comparison
 *   how does it work      journey
 *   what if you fail      guarantee
 *   where are the limits  scope
 *   is it real            build wall
 *   I have no designer    design
 *   -> start              configurator entry, the conversion point
 *   prove it              portfolio, reviews
 *   then what             maintenance, referral
 *   I still have doubts   FAQ
 *   -> start              closing call to action
 *
 * The conversion point sits in the middle rather than only at the end: by that
 * stage the price, the process and the guarantee have all been answered, and a
 * reader who is convinced should not have to scroll past four more sections to
 * act on it.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <Products />
      <Comparison />
      <Journey />
      <Guarantee />
      <Scope />
      <BuildWall />
      <DesignForMe />
      <ConfiguratorEntry />
      <Portfolio />
      <Testimonials />
      <Maintenance />
      <Referral />
      <Faq />
      <ClosingCta />
    </>
  );
}
