import { defineHook } from "workflow";

// Shared hooks for IC employee workflows
// These are used by meeting orchestrator and other workflows to communicate with ICs

export type ICMeetingEvent = {
  type: "joinMeeting";
  meetingId: string;
  meetingType: string;
};

export type ICPingEvent =
  | {
      type: "receivePing";
      pingId: string;
      from: string;
      message: string;
    }
  | {
      type: "pingResponse";
      pingId: string;
      to: string; // Original sender
      response: string;
    };

// Define hooks for IC workflows
export const icMeetingHook = defineHook<ICMeetingEvent>();
export const icPingHook = defineHook<ICPingEvent>();

