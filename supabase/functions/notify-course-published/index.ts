/**
 * Supabase Edge Function: notify-course-published
 *
 * Triggered by a Supabase Database Webhook on INSERT or UPDATE to
 * the `published_courses` table.
 *
 * Fetches all push subscriptions and sends a Web Push notification
 * to every registered device. Expired subscriptions (HTTP 410) are
 * automatically removed from the database.
 *
 * Required Supabase secrets:
 *   VAPID_PUBLIC_KEY   — the public VAPID key (also hardcoded in app.js)
 *   VAPID_PRIVATE_KEY  — the private VAPID key (never exposed to clients)
 *   VAPID_EMAIL        — mailto: contact for the VAPID identity
 *   SUPABASE_URL       — injected automatically by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — injected automatically by Supabase
 */

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY       = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY      = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_EMAIL            = Deno.env.get("VAPID_EMAIL") ?? "mailto:info@gbsc.ie";
const SUPABASE_URL           = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

Deno.serve(async (req) => {
  // Only accept POST (Supabase webhooks are POST)
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // Only block explicit DELETE or unrecognised events
  // (type is absent when invoked directly via the Supabase test button)
  const eventType = body.type as string | undefined;
  if (eventType && eventType !== "INSERT" && eventType !== "UPDATE") {
    return new Response("Ignored event type: " + eventType, { status: 200 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Fetch all push subscriptions
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");

  if (error) {
    console.error("Failed to fetch push_subscriptions:", error);
    return new Response("DB error", { status: 500 });
  }

  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ sent: 0, message: "No subscribers" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const payload = JSON.stringify({
    title: "🗺 Course Published",
    body: "The Race Officer has set today's course — tap to view",
    tag: "course-published",
    url: "/",
  });

  // Send to all subscribers in parallel
  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      )
    ),
  );

  // Remove subscriptions that have expired (HTTP 410 Gone)
  const expiredEndpoints: string[] = [];
  results.forEach((result, i) => {
    if (
      result.status === "rejected" &&
      (result.reason?.statusCode === 410 || result.reason?.statusCode === 404)
    ) {
      expiredEndpoints.push(subs[i].endpoint);
    }
  });

  if (expiredEndpoints.length > 0) {
    await supabase
      .from("push_subscriptions")
      .delete()
      .in("endpoint", expiredEndpoints);
    console.log(`Removed ${expiredEndpoints.length} expired subscription(s)`);
  }

  const sent    = results.filter((r) => r.status === "fulfilled").length;
  const failed  = results.length - sent - expiredEndpoints.length;

  console.log(`Push notifications: ${sent} sent, ${expiredEndpoints.length} expired, ${failed} failed`);

  return new Response(
    JSON.stringify({ sent, expired: expiredEndpoints.length, failed }),
    { headers: { "Content-Type": "application/json" } },
  );
});
