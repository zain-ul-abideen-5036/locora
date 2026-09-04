import { redirect } from "next/navigation";

/**
 * The console has no landing page of its own.
 *
 * A reviewer opening it wants the queue, so this redirects straight there
 * rather than showing an index page whose only content is a link to the queue.
 */
export default function ReviewIndexPage() {
  redirect("/review/queue");
}
