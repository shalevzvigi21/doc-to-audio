"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Clock,
  Loader2,
  Shield,
  Users,
  X,
} from "lucide-react";
import type {
  AdminDayPoint,
  AdminSummary,
  AdminUserRow,
  UserStatus,
} from "@doc-to-audio/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { mobileAdmin } from "@/lib/mobile-strings-admin";

type FilterType = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("he-IL");
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const date = d.toLocaleDateString("he-IL");
    const time = d.toLocaleTimeString("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${date}, ${time}`;
  } catch {
    return iso;
  }
}

function formatDayLabel(dayStr: string): string {
  try {
    const parts = dayStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}`;
    }
    const d = new Date(dayStr);
    if (Number.isNaN(d.getTime())) return dayStr;
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    return `${day}/${month}`;
  } catch {
    return dayStr;
  }
}

function formatHours(hours: number): string {
  if (Number.isInteger(hours)) {
    return hours.toString();
  }
  return hours.toFixed(1);
}

function StatusPill({ status }: { status: UserStatus }) {
  const config = {
    APPROVED: {
      label: mobileAdmin.status.APPROVED,
      className: "text-ok bg-ok/10 border-ok/20",
    },
    PENDING: {
      label: mobileAdmin.status.PENDING,
      className: "text-warn bg-warn/10 border-warn/20",
    },
    REJECTED: {
      label: mobileAdmin.status.REJECTED,
      className: "text-destructive bg-destructive/10 border-destructive/20",
    },
  }[status];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        config.className,
      )}
    >
      {config.label}
    </span>
  );
}

export function AdminDashboard(props: {
  summary: AdminSummary;
  series: AdminDayPoint[]; // one point per day, oldest first
  users: AdminUserRow[]; // newest first
  /** Approve or reject a user. Returns an error message on failure, or undefined on success. */
  onDecide: (userId: string, action: "approve" | "reject") => Promise<string | undefined>;
}): JSX.Element {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"approve" | "reject" | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  // Reject confirmation on approved users
  const [confirmingRejectId, setConfirmingRejectId] = useState<string | null>(null);
  const confirmTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current);
      }
    };
  }, []);

  const handleDecide = (userId: string, action: "approve" | "reject") => {
    setRowErrors((prev) => {
      const copy = { ...prev };
      delete copy[userId];
      return copy;
    });
    setBusyUserId(userId);
    setBusyAction(action);

    startTransition(async () => {
      try {
        const errorMsg = await props.onDecide(userId, action);
        if (errorMsg) {
          setRowErrors((prev) => ({ ...prev, [userId]: errorMsg }));
        } else {
          router.refresh();
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : mobileAdmin.errors.generic;
        setRowErrors((prev) => ({ ...prev, [userId]: message }));
      } finally {
        setBusyUserId(null);
        setBusyAction(null);
      }
    });
  };

  const handleRejectTap = (userId: string) => {
    if (confirmingRejectId === userId) {
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = null;
      }
      setConfirmingRejectId(null);
      handleDecide(userId, "reject");
    } else {
      setConfirmingRejectId(userId);
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current);
      }
      confirmTimerRef.current = setTimeout(() => {
        setConfirmingRejectId((curr) => (curr === userId ? null : curr));
      }, 4000);
    }
  };

  // Pending users list for the top priority card
  const pendingUsers = useMemo(() => {
    return props.users.filter((u) => u.status === "PENDING");
  }, [props.users]);

  // Chart computations
  const totalSignups = useMemo(
    () => props.series.reduce((sum, p) => sum + p.signups, 0),
    [props.series],
  );
  const totalLogins = useMemo(
    () => props.series.reduce((sum, p) => sum + p.logins, 0),
    [props.series],
  );
  const maxSeriesVal = useMemo(
    () => Math.max(1, ...props.series.flatMap((p) => [p.signups, p.logins])),
    [props.series],
  );
  const chartAriaSummary = useMemo(
    () =>
      mobileAdmin.chart.accessibleSummary(
        totalSignups,
        totalLogins,
        props.series.length,
      ),
    [totalSignups, totalLogins, props.series.length],
  );

  // Client-side filtering
  const [filter, setFilter] = useState<FilterType>("ALL");
  const counts = useMemo(
    () => ({
      ALL: props.users.length,
      PENDING: props.users.filter((u) => u.status === "PENDING").length,
      APPROVED: props.users.filter((u) => u.status === "APPROVED").length,
      REJECTED: props.users.filter((u) => u.status === "REJECTED").length,
    }),
    [props.users],
  );

  const filteredUsers = useMemo(() => {
    if (filter === "ALL") return props.users;
    return props.users.filter((u) => u.status === filter);
  }, [props.users, filter]);

  const filterOptions: Array<{ key: FilterType; label: string }> = [
    { key: "ALL", label: mobileAdmin.filters.all },
    { key: "PENDING", label: mobileAdmin.filters.pending },
    { key: "APPROVED", label: mobileAdmin.filters.approved },
    { key: "REJECTED", label: mobileAdmin.filters.rejected },
  ];

  const summaryCards = [
    {
      key: "totalUsers",
      label: mobileAdmin.summary.totalUsers,
      value: props.summary.totalUsers.toLocaleString("he-IL"),
      unit: null,
    },
    {
      key: "newThisWeek",
      label: mobileAdmin.summary.newThisWeek,
      value: props.summary.newThisWeek.toLocaleString("he-IL"),
      unit: null,
    },
    {
      key: "activeDay",
      label: mobileAdmin.summary.activeToday,
      value: props.summary.activeDay.toLocaleString("he-IL"),
      unit: null,
    },
    {
      key: "activeWeek",
      label: mobileAdmin.summary.activeWeek,
      value: props.summary.activeWeek.toLocaleString("he-IL"),
      unit: null,
    },
    {
      key: "activeMonth",
      label: mobileAdmin.summary.activeMonth,
      value: props.summary.activeMonth.toLocaleString("he-IL"),
      unit: null,
    },
    {
      key: "documentsConverted",
      label: mobileAdmin.summary.documentsConverted,
      value: props.summary.documentsConverted.toLocaleString("he-IL"),
      unit: null,
    },
    {
      key: "audioHours",
      label: mobileAdmin.summary.audioHours,
      value: formatHours(props.summary.audioHours),
      unit: mobileAdmin.summary.hoursUnit,
    },
  ];

  return (
    <div className="mx-auto max-w-[880px] px-4 pb-24 pt-6 space-y-7" dir="rtl">
      {/* 1. Header row */}
      <header className="flex items-center justify-between gap-4 pb-2 border-b">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          {mobileAdmin.header.title}
        </h1>
        <Link
          href="/library"
          className="inline-flex items-center gap-2 rounded-xl border border-input bg-card px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition active:scale-[0.98] min-h-[44px] min-w-[44px] justify-center"
        >
          <ArrowRight className="h-4 w-4" />
          <span>{mobileAdmin.header.backToLibrary}</span>
        </Link>
      </header>

      {/* 2. Highlighted card for pending users */}
      {props.summary.pendingUsers > 0 && (
        <section
          aria-labelledby="pending-users-heading"
          className="rounded-2xl border-2 border-primary/30 bg-primary/[0.03] p-4 sm:p-5 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Clock className="h-4 w-4" />
              </div>
              <h2
                id="pending-users-heading"
                className="text-lg font-bold text-foreground"
              >
                {mobileAdmin.pendingCard.title(props.summary.pendingUsers)}
              </h2>
            </div>
            <span className="num rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-semibold">
              {props.summary.pendingUsers}
            </span>
          </div>

          {pendingUsers.length > 0 ? (
            <div className="divide-y divide-border/60">
              {pendingUsers.map((user) => {
                const userBusy = isPending && busyUserId === user.id;
                return (
                  <div key={user.id} className="py-3.5 first:pt-1 last:pb-1">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p
                          className="font-semibold text-foreground truncate text-start text-sm sm:text-base"
                          dir="ltr"
                          title={user.email}
                        >
                          {user.email}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <span>{mobileAdmin.pendingCard.signedUpAt} </span>
                          <span className="num">
                            {formatDateTime(user.createdAt)}
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 w-full sm:w-auto">
                        <Button
                          variant="default"
                          size="sm"
                          disabled={userBusy}
                          onClick={() => handleDecide(user.id, "approve")}
                          className="h-11 min-h-[44px] flex-1 sm:flex-initial sm:min-w-[88px] px-4 font-medium"
                        >
                          {userBusy && busyAction === "approve" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4 ms-1" />
                          )}
                          {mobileAdmin.pendingCard.approve}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={userBusy}
                          onClick={() => handleDecide(user.id, "reject")}
                          className="h-11 min-h-[44px] flex-1 sm:flex-initial sm:min-w-[88px] px-4 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive font-medium"
                        >
                          {userBusy && busyAction === "reject" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <X className="h-4 w-4 ms-1" />
                          )}
                          {mobileAdmin.pendingCard.reject}
                        </Button>
                      </div>
                    </div>

                    {rowErrors[user.id] && (
                      <p className="text-xs text-destructive mt-1.5 font-medium">
                        {rowErrors[user.id]}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {mobileAdmin.empty.noPending}
            </p>
          )}
        </section>
      )}

      {/* 3. Summary cards */}
      <section
        aria-label={mobileAdmin.header.title}
        className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4"
      >
        {summaryCards.map((item) => (
          <div
            key={item.key}
            className="rounded-2xl border bg-card p-3.5 sm:p-4 flex flex-col justify-between gap-1.5 shadow-sm"
          >
            <span className="text-xs sm:text-sm font-medium text-muted-foreground leading-snug">
              {item.label}
            </span>
            <div className="flex items-baseline gap-1">
              <span className="num text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                {item.value}
              </span>
              {item.unit && (
                <span className="text-xs sm:text-sm text-muted-foreground font-normal">
                  {item.unit}
                </span>
              )}
            </div>
          </div>
        ))}
      </section>

      {/* 4. Bar chart of the last days */}
      <section
        role="region"
        aria-label={chartAriaSummary}
        className="rounded-2xl border bg-card p-4 sm:p-5 space-y-4 shadow-sm"
      >
        <p className="sr-only">{chartAriaSummary}</p>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-base sm:text-lg font-bold text-foreground">
            {mobileAdmin.chart.title}
          </h2>
          <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-primary inline-block" />
              <span>{mobileAdmin.chart.signupsLegend}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-muted-foreground/40 inline-block" />
              <span>{mobileAdmin.chart.loginsLegend}</span>
            </div>
          </div>
        </div>

        {props.series.length > 0 ? (
          <div className="w-full pt-4" dir="ltr">
            <div className="flex h-36 sm:h-44 w-full items-end justify-between gap-[2px] sm:gap-1 pb-2 border-b border-border/60">
              {props.series.map((point) => {
                const signupHeight =
                  point.signups > 0
                    ? Math.max(4, Math.round((point.signups / maxSeriesVal) * 100))
                    : 0;
                const loginHeight =
                  point.logins > 0
                    ? Math.max(4, Math.round((point.logins / maxSeriesVal) * 100))
                    : 0;

                return (
                  <div
                    key={point.day}
                    className="flex-1 min-w-[3px] h-full flex items-end justify-center gap-[1px] sm:gap-0.5 group relative"
                    title={`${point.day} | ${mobileAdmin.chart.signupsLegend}: ${point.signups}, ${mobileAdmin.chart.loginsLegend}: ${point.logins}`}
                  >
                    <div
                      style={{ height: `${signupHeight}%` }}
                      className="w-full max-w-[8px] min-w-[1px] bg-primary rounded-t-sm transition-all"
                    />
                    <div
                      style={{ height: `${loginHeight}%` }}
                      className="w-full max-w-[8px] min-w-[1px] bg-muted-foreground/40 rounded-t-sm transition-all"
                    />
                  </div>
                );
              })}
            </div>

            {/* X-axis labels: first, middle, last day (DD/MM) */}
            <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground num">
              <span>{formatDayLabel(props.series[0].day)}</span>
              {props.series.length > 2 && (
                <span className="text-center">
                  {formatDayLabel(
                    props.series[Math.floor(props.series.length / 2)].day,
                  )}
                </span>
              )}
              {props.series.length > 1 && (
                <span className="text-end">
                  {formatDayLabel(props.series[props.series.length - 1].day)}
                </span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            {mobileAdmin.chart.empty}
          </p>
        )}
      </section>

      {/* 5 & 6. Filter chips & Users table/list */}
      <section className="space-y-4">
        {/* Filter chips */}
        <div
          role="tablist"
          aria-label={mobileAdmin.header.title}
          className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]"
        >
          {filterOptions.map((opt) => {
            const active = filter === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(opt.key)}
                className={cn(
                  "inline-flex h-10 max-sm:h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition active:scale-[0.98]",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-secondary",
                )}
              >
                <span>{opt.label}</span>
                <span className="num text-xs opacity-75">
                  ({counts[opt.key]})
                </span>
              </button>
            );
          })}
        </div>

        {/* Desktop table: sm: and up */}
        <div className="hidden sm:block overflow-hidden rounded-2xl border bg-card shadow-sm">
          <table className="w-full text-start text-sm">
            <thead className="bg-secondary/50 text-xs font-semibold text-muted-foreground border-b border-border">
              <tr>
                <th className="py-3 px-4 text-start font-medium">
                  {mobileAdmin.table.email}
                </th>
                <th className="py-3 px-4 text-start font-medium">
                  {mobileAdmin.table.status}
                </th>
                <th className="py-3 px-4 text-start font-medium">
                  {mobileAdmin.table.signedUp}
                </th>
                <th className="py-3 px-4 text-start font-medium">
                  {mobileAdmin.table.lastLogin}
                </th>
                <th className="py-3 px-4 text-start font-medium">
                  {mobileAdmin.table.logins}
                </th>
                <th className="py-3 px-4 text-start font-medium">
                  {mobileAdmin.table.documents}
                </th>
                <th className="py-3 px-4 text-start font-medium">
                  {mobileAdmin.table.audioMinutes}
                </th>
                <th className="py-3 px-4 text-end font-medium">
                  {mobileAdmin.table.actions}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredUsers.length > 0 ? (
                filteredUsers.map((user) => {
                  const userBusy = isPending && busyUserId === user.id;
                  const isConfirmingReject = confirmingRejectId === user.id;

                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-secondary/20 transition-colors"
                    >
                      <td
                        className="py-3.5 px-4 font-medium text-foreground truncate max-w-[200px]"
                        dir="ltr"
                      >
                        <div>
                          <span title={user.email}>{user.email}</span>
                          {rowErrors[user.id] && (
                            <span className="block text-xs text-destructive mt-1 font-medium">
                              {rowErrors[user.id]}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {user.isAdmin ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-secondary border border-border px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
                            <Shield className="h-3 w-3" />
                            {mobileAdmin.status.adminBadge}
                          </span>
                        ) : (
                          <StatusPill status={user.status} />
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-muted-foreground num text-xs">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        {user.lastLoginAt ? (
                          <span className="num text-muted-foreground">
                            {formatDate(user.lastLoginAt)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/70">
                            {mobileAdmin.users.neverLoggedIn}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-foreground num font-semibold">
                        {user.loginCount}
                      </td>
                      <td className="py-3.5 px-4 text-foreground num font-semibold">
                        {user.documents}
                      </td>
                      <td className="py-3.5 px-4 text-foreground num font-semibold">
                        {user.audioMinutes}
                      </td>
                      <td className="py-3.5 px-4 text-end">
                        {user.isAdmin ? (
                          <span className="text-muted-foreground/50 text-xs">
                            {mobileAdmin.users.noActions}
                          </span>
                        ) : user.status === "PENDING" ||
                          user.status === "REJECTED" ? (
                          <Button
                            size="sm"
                            variant="default"
                            disabled={userBusy}
                            onClick={() => handleDecide(user.id, "approve")}
                            className="h-8 px-3 text-xs font-medium"
                          >
                            {userBusy && busyAction === "approve" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5 ms-1" />
                            )}
                            {mobileAdmin.actions.approve}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant={isConfirmingReject ? "destructive" : "outline"}
                            disabled={userBusy}
                            onClick={() => handleRejectTap(user.id)}
                            className={cn(
                              "h-8 px-3 text-xs font-medium transition-all",
                              isConfirmingReject
                                ? "bg-destructive text-destructive-foreground animate-fade-in"
                                : "border-input text-muted-foreground hover:text-destructive hover:border-destructive/40",
                            )}
                          >
                            {userBusy && busyAction === "reject" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : null}
                            {isConfirmingReject
                              ? mobileAdmin.actions.confirmReject
                              : mobileAdmin.actions.block}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={8}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {filter === "ALL"
                      ? mobileAdmin.empty.noUsers
                      : filter === "PENDING"
                      ? mobileAdmin.empty.noPending
                      : filter === "APPROVED"
                      ? mobileAdmin.empty.noApproved
                      : mobileAdmin.empty.noRejected}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile stacked cards: under sm */}
        <div className="block sm:hidden space-y-3">
          {filteredUsers.length > 0 ? (
            filteredUsers.map((user) => {
              const userBusy = isPending && busyUserId === user.id;
              const isConfirmingReject = confirmingRejectId === user.id;

              return (
                <div
                  key={user.id}
                  className="rounded-2xl border bg-card p-4 space-y-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p
                        className="font-semibold text-foreground text-sm truncate text-start"
                        dir="ltr"
                        title={user.email}
                      >
                        {user.email}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <span>{mobileAdmin.table.signedUp}: </span>
                        <span className="num">{formatDate(user.createdAt)}</span>
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                      {user.isAdmin && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-secondary border border-border px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                          <Shield className="h-3 w-3" />
                          {mobileAdmin.status.adminBadge}
                        </span>
                      )}
                      <StatusPill status={user.status} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50 text-xs">
                    <div>
                      <span className="text-muted-foreground">
                        {mobileAdmin.table.lastLogin}:{" "}
                      </span>
                      <span
                        className={cn(
                          "font-medium",
                          user.lastLoginAt
                            ? "num text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {user.lastLoginAt
                          ? formatDate(user.lastLoginAt)
                          : mobileAdmin.users.neverLoggedIn}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {mobileAdmin.table.logins}:{" "}
                      </span>
                      <span className="num font-semibold text-foreground">
                        {user.loginCount}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {mobileAdmin.table.documents}:{" "}
                      </span>
                      <span className="num font-semibold text-foreground">
                        {user.documents}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {mobileAdmin.table.audioMinutes}:{" "}
                      </span>
                      <span className="num font-semibold text-foreground">
                        {user.audioMinutes}
                      </span>
                    </div>
                  </div>

                  {!user.isAdmin && (
                    <div className="pt-2 border-t border-border/50 flex items-center justify-end gap-2">
                      {user.status === "PENDING" ||
                      user.status === "REJECTED" ? (
                        <Button
                          size="sm"
                          variant="default"
                          disabled={userBusy}
                          onClick={() => handleDecide(user.id, "approve")}
                          className="h-11 min-h-[44px] px-5 font-medium w-full"
                        >
                          {userBusy && busyAction === "approve" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4 ms-1" />
                          )}
                          {mobileAdmin.actions.approve}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant={isConfirmingReject ? "destructive" : "outline"}
                          disabled={userBusy}
                          onClick={() => handleRejectTap(user.id)}
                          className={cn(
                            "h-11 min-h-[44px] px-5 font-medium w-full transition-all",
                            isConfirmingReject
                              ? "bg-destructive text-destructive-foreground animate-fade-in"
                              : "border-input text-muted-foreground hover:text-destructive hover:border-destructive/40",
                          )}
                        >
                          {userBusy && busyAction === "reject" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : null}
                          {isConfirmingReject
                            ? mobileAdmin.actions.confirmReject
                            : mobileAdmin.actions.block}
                        </Button>
                      )}
                    </div>
                  )}

                  {rowErrors[user.id] && (
                    <p className="text-xs text-destructive font-medium pt-1">
                      {rowErrors[user.id]}
                    </p>
                  )}
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center bg-card/50">
              <Users className="mx-auto h-8 w-8 text-muted-foreground/60 mb-2" />
              <p className="text-sm font-medium text-muted-foreground">
                {filter === "ALL"
                  ? mobileAdmin.empty.noUsers
                  : filter === "PENDING"
                  ? mobileAdmin.empty.noPending
                  : filter === "APPROVED"
                  ? mobileAdmin.empty.noApproved
                  : mobileAdmin.empty.noRejected}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
