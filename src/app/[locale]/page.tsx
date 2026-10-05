import { BuildWall } from "@/components/home/build-wall";
import { ClosingCta } from "@/components/home/closing-cta";
import { Guarantee } from "@/components/home/guarantee";
import { Hero } from "@/components/home/hero";
import { Journey } from "@/components/home/journey";
import { Products } from "@/components/home/products";
import { Scope } from "@/components/home/scope";

/**
 * Marketing home page.
 *
 * Composition only -- each section owns its own data access and copy, which
 * keeps this file a readable table of contents for the page rather than a
 * thousand-line template.
 *
 * Section order follows the argument the page has to make: the promise, what
 * you can buy, how it is made, what is guaranteed, where the limits are, proof,
 * and then the ask.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <Products />
      <Journey />
      <Guarantee />
      <Scope />
      <BuildWall />
      <ClosingCta />
    </>
  );
}
