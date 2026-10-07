# Hardware and runtime tests (user)

Agents can't touch the scale, the machine or the phone, so these tests are yours. Fill in the
**Result** column, or paste your notes or screenshots to an agent and it will record them here.
Once a Part A answer is in, an agent also copies it into `docs/spec-v2.md`'s table in "Unknowns to test
before building", as the spec asks.

Part A is the spec's Phase 0. You can run it with nRF Connect or LightBlue (no code needed), or
with the in-app probe, which is deployed (T1.8). The probe records everything it sees, so its
recordings double as test fixtures. Part B needs the deployed app on the phone, in beacio first
(D-016). Part C lists the recordings to capture for the analysis work.

Byte numbers below are **1-based**, as in the spec. Code uses 0-based offsets
(`docs/protocol-notes.md`).

A result marked (S1) or (S2) comes from session 1 or 2; "Sessions" at the end has the details.

## Using the probe (T1.8)

Open <https://misch0n.github.io/smart-scale/#/probe> in a Safari tab with beacio, or tap
**Setup** in the app's tab bar: the probe is the Setup tab until the Setup screens (T2.9, D-072).
Tap **Connect** and pick the scale. Everything from Connect to Disconnect is recorded,
and the recording appears under **Recordings**, where **Export** turns it into a file. The probe
turns smoothing off by itself; "Smoothing (A13)" reads `confirmed` once a frame shows it off.
The annotation buttons and the note field put marks on the recording's timeline.
**Record sound** (under Sound levels) records the microphone's loudness in a few bands, 20
times a second, into every recording until **Stop sound**: before Connect or after, it stays on
across Disconnect and Connect. No audio is kept.

Where each answer shows:

| Test | Where on the probe |
| --- | --- |
| A1 | Recording: "Timer gaps (A1)" once the timer runs (tap **Tare + start**), and "FF11 arrival gaps" |
| A2 | Weight statistics: σ over the last 0.5 s and 2 s, before the pump, during it and after. Tap **pump on** and **pump off** as they happen |
| A3, A8 | Scale: the weight |
| A4, A5, A12 | Commands: **Start timer**, **Tare + start**, **Stop timer**, **Reset timer**; Scale: "Timer (bytes 3–5)" |
| A6 | Scale: "Standby (bytes 15–16)"; Commands: **Keep-alive (unverified)** |
| A7 | "FF12 frames", highlighted once anything arrives. FF11 frames that aren't weight frames are highlighted too |
| A9, A10 | Recording: "Unit byte (A9)"; Weight statistics: "Sign bytes seen (A10)" |
| A11 | Weight statistics: "Smallest step (A11)", and σ over the last 10 s on an empty, still platform |
| A13 | Recording: "Smoothing (A13)" |
| A14 | Connection: the device name. Whether 0FFE is advertised can't be seen from the browser; nRF Connect shows it |
| A15 | Connection: "FF11 properties" and "FF12 properties" |
| A16 | Recording: "Failed frames (A16)". If nearly all fail, the checksum doesn't match |
| B2 | Connection: the state line, which names the step that failed |
| B3 | Connection: **Reconnect known device**, and the line under the state: Web Bluetooth, `getDevices()`, the remembered scale, the failed attempts. The box below it holds the last error |
| B4 | Recording: "Longest silence (B4)". The events list shows `page-hidden` and `page-visible` |
| B5 | Connection: "Screen wake lock", which says `held` or why not. **Keep screen on** asks again |
| B6 | This browser: "Persistent storage" |
| B7 | Recordings: **Export**, then **Download** or **Share…** |
| B8 | Microphone: **Try microphone**. Sound levels: **Record sound**, its status line and the levels |
| B10 | Automatic export: the status line, and **Settings** |
| M1–M5 | Connection: "Scale mode (T1.25)", what the mode check found and what that rests on |

## The brew flow on the phone (T1.18)

Open <https://misch0n.github.io/smart-scale/#/brew> (or tap **Brew** in the tab bar). It is the extraction screen, then the live view, then the shot card, in the Instrument
look, light or dark as the phone is set. Pull a shot the usual way and check:

| # | Check | Expected | Result |
| --- | --- | --- | --- |
| D1 | **Connect scale**, then put the cup down | One tap connects; the vessel card names the cup ("Espresso cup · 110.0 g · recognised" once it is learned, K2; else "Not a known container") about 3 s after the cup settles, and the scale's display zeroes (a plain tare, D-066). The screen stays on | |
| D2 | The recipe and the target | Tap the recipe to pick another. The big target is the dose × the ratio, the dose being the ground weight, else the beans, else the basket's size (since T2.5 there is no dose stepper; it says which, "basket" say). Reload the page: the recipe is kept | |
| D3 | Tap **Start** as the pump starts | The live view opens: "x g to go" with the bar, the flow, the time from the tap, the chart; the scale's own timer starts from 0. Readable from about a metre? | |
| D4 | Past the target | "Target reached" in green up to +1.0 g, then "Over target" in red; "Pump off at … s" once the pump stops | |
| D5 | "Shot done" | About a second after the drips stop, the shot card opens and the scale's timer stops. Within a few seconds: yield, time and ratio against the target, first drip, extraction, average flow and a small chart. Do they look right against what you saw? | |
| D6 | Grades and Save | Tap a taste, toggle channelling, tap or add tags, **Save shot**: back to the extraction screen. Export the recording from the probe: the shot carries them | |
| D7 | Dark and light | The screens follow the phone's setting | |

## Home and the tab bar on the phone (T1.23)

The app opens on Home: the scale, its weight with **Tare**, the last shot and the last 7 days,
with the tab bar at the bottom (D-072). Open <https://misch0n.github.io/smart-scale/> in Safari
with beacio and check:

| # | Check | Expected | Result |
| --- | --- | --- | --- |
| H1 | Open the app with the scale on | Home, with today's date. With a scale remembered (T1.21), it connects by itself: the scale's name (`BOOKOO_SC …`), "Connected", the battery, and the weight as the scale shows it | |
| H2 | Put something on the scale, tap **Tare** | The weight on Home and on the scale's display go to 0.0 | |
| H3 | The tab bar | At the bottom, clear of Safari's toolbar and the home indicator, readable in light and dark. **Brew** opens the extraction screen without the bar, and its ✕ comes back Home; **History** has the bar; **Setup** opens the probe | |
| H4 | After a shot (D1–D6), back Home | "Last shot" names it (weekday and time, drink, taste) with its small graph, yield, ratio and first drip; tapping it opens its page. "Last 7 days" counts it, with the averages and the tastes | |
| H5 | With the scale off | The scale's card says "Waiting for the scale…" with **Stop** and **Choose scale**, as the brew screen's does (R3–R5) | |

## The scale-mode check on the phone (T1.25)

On connect, the app checks that the scale is in its timer mode, the one it keeps the scale's
timer in step with (D-038): with the scale idle, it sends Start timer, and if the timer starts it
stops and resets it at once. If it doesn't start, Home's scale card shows a caution line, "The
scale isn't in its timer mode: switch it on the scale", and the brew screen a notice. While the
warning shows, the app checks again every 5 s whenever no cup is on the scale, so it goes by
itself once you switch (D-073). The probe's Connection panel says what each check found
("Scale mode (T1.25)"). Open <https://misch0n.github.io/smart-scale/> in Safari with beacio,
with nothing on the scale, and check:

| # | Check | Expected | Result |
| --- | --- | --- | --- |
| M1 | Put the scale in its flow-rate mode, then open the app (or connect) | Within a second of connecting: the caution line under the weight on Home. The scale's display doesn't change. The probe says "NOT the timer mode: the 04 [mode-check] … didn't start the timer within 500 ms" | |
| M2 | While connected and with nothing on the scale, switch it to its timer mode | Within about 5 s the caution line goes, and the scale's timer starts and goes back to 0 once (a tick or two). Note what the scale's timer read right after the switch: 0, or something else | |
| M3 | Disconnect (or reload), then connect with the scale in its timer mode | No warning. Within about a second of connecting, the scale's timer starts and resets once. On the probe: "Timer mode: the 04 [mode-check] at … started the timer … ms later": note the ms | |
| M4 | In the timer mode, press the scale's own timer key, then press it again to stop it | No warning, at any point | |
| M5 | Optional: connect with the scale in its automatic mode | The warning. Put a cup down and pour a little water into it: the probe's line names "03 0D started". Lift the cup and switch to the timer mode: the warning goes within about 5 s | |

If the timer doesn't start in M3 but the scale is in its timer mode, or it starts later than
half a second, copy the probe's line: the window is provisional (`PROVISIONAL(U1.1: T1.25
check)`).

## The reconnect on the phone (T1.21, B3)

The app remembers the scale on the phone and reconnects to it by itself, without the chooser,
and keeps trying while the scale is off (D-071). Open <https://misch0n.github.io/smart-scale/#/brew>
in Safari with beacio; if something fails there, repeat it in Bluefy. Check:

| # | Check | Expected | Result |
| --- | --- | --- | --- |
| R1 | **Connect scale** once (the chooser), then reload the page | After the reload, "Waiting for the scale…" for a moment, then the cup card: connected with no tap and no chooser | |
| R2 | Force-quit Safari, then open the app again | As R1 | |
| R3 | With the app open and connected, switch the scale off; wait 30 s; switch it on | "Waiting for the scale…" while it is off; it connects by itself within about 10 s of switching on | |
| R4 | While it waits, tap **Stop**, then **Connect scale** | Stop: "Not connected", and no more tries. Connect scale: connects without the chooser | |
| R5 | While it waits, tap **Choose scale** | The chooser opens | |
| R6 | Set beacio to "Allow for One Day" for the site (or wait for it to lapse), then open the app | If Web Bluetooth comes late, the app connects by itself. If it never comes: after about 10 s, "No Bluetooth" with **Reload**; setting beacio to "Always Allow on This Website" and reloading fixes it | |
| R7 | After a reconnect with no tap, tap anything (**Start**, say), then check the probe's "Screen wake lock" | The first tap gets the screen wake lock: `held` | |

If R1 or R2 fails, open the probe (`#/probe`): its Connection panel shows whether Web Bluetooth
and `getDevices()` are there, the remembered scale, the failed tries and the last error. Copy
them into B3. If the browser can't reconnect without the chooser at all, the next agent asks
whether to move the Capacitor wrapper (T3.4) up the order (spec "Re-pairing — check early").

## Setup on the phone (T2.9)

The Setup tab now opens Setup (`#/setup`): a row for the machine, grinders, recipes, coffee
packs, containers, tags and the microphone, the data export, the automatic export and the probe
(D-077). Every change is stored as it is made: a text field when you leave it (or tap Done), a
stepper or a switch with each tap. Open <https://misch0n.github.io/smart-scale/#/setup> in Safari
with beacio, and check:

| # | Check | Expected | Result |
| --- | --- | --- | --- |
| S1 | Open each row, then its **‹ Setup** link | Each page opens with the tab bar, Setup lit; the link goes back. **Probe** opens the probe, whose **‹ Setup** comes back | |
| S2 | Machine: change the name (tap Done on the keyboard), tap + on the pressure a few times, hold +, then **Add basket**, name it, set its size, **Make default** | The name stays after leaving the field; a tap steps 0.5 bar, a hold repeats without selecting text or zooming; the new basket shows Default. Back on Setup, the row says the new name, pressure and "2 baskets" | |
| S3 | Coffee packs: **Add pack**, fill in brand, name and weight, pick a roast date with the phone's date picker, **Add pack** | "Day N off roast" appears once the roast date is set; the pack's page opens. In the list it is under Unopened; **Open** moves it to Open with today's date | |
| S4 | On the open pack, **Finish**, pick **Would buy again**, **Finish pack** | It moves to Finished with "Would buy again" | |
| S5 | Containers: connect the scale on the page (nothing on it), put an empty cup on it, wait for "Scale reads" to settle, type a name, **Weigh & add** | The row shows the cup's weight to 0.1 g, as the scale's display does. Lift it and put on something within 3 g of it (or the same cup with a little water), add it: a warning names the two, and Setup shows it under Needs attention; **Dismiss** puts it away | |
| S6 | Tags: switch a default on, add a tag, rename one | The header counts follow; new tags start off | |
| S7 | Setup's **Export all (JSON)**, then **Share** (or **Download**) | The share sheet offers the file; it opens in Files and holds `entities` | |
| S8 | Reload, or force-quit and reopen | Everything changed above is still there | |

If a change doesn't stay (S2, S8), note which field: the notice at the top of the page says when a
change couldn't be stored.

## Containers recognised on the phone (T2.4)

The app now sees what is put on the scale and matches it against the containers learned in Setup
(D-078): Home's scale card says which one is on, and a known one put down while Home shows opens
the brew on its phase (T2.16, D-091). Learn your dosing cup and your shot cup first
(Setup › Containers, S5). Open <https://misch0n.github.io/smart-scale/> in Safari with beacio,
connected, nothing on the scale, and check:

| # | Check | Expected | Result |
| --- | --- | --- | --- |
| K1 | In Setup › Containers, put the dosing cup on and watch "Scale reads"; Weigh again three times, lifting it in between | It settles on the scale's own display within about 3 s; the three masses agree within 0.1 g. Note how long it took to settle | |
| K2 | On Home, put the shot cup on. Tap ✕ with the cup still on; lift it; put the dosing cup on | Within about 3 s the brew opens on the extraction, the cup named and recognised (T2.16). Back Home with the cup on, Home stays, its row "Recognised · opens Extraction"; after the lift, "Put a container down"; the dosing cup opens the brew on the beans. Note any wrong or missed one, with the masses Setup shows | |
| K3 | On Home, put the shot cup on with a little water in it (1–2 g); ✕; then a vessel you haven't learned | The cup is still recognised: the brew opens on the extraction. The other says "Not a known container · N g" and stays on Home; its row opens Setup › Containers | |
| K4 | Learn the same cup a second time under another name, then put it on with Home showing | "Which container is it?" with both names, on Home; tap one: the brew opens on the extraction, the cup "picked". Remove the second one in Setup afterwards | |
| K5 | Pull a shot on the brew screen into the learned cup, then open its page with `?debug` at the end of the address (`#/shot/<id>?debug`) | The record's `containerId` is the cup's id (as in the export's `entities.containers`) | |
| K6 | With a container on, press the scale's own tare button; then lift it and put it back | After the button: "Put a container down" (the scale sends nothing, A7: a known limit); put back, it is recognised again | |
| K7 | The mat (T2.17): Setup › Containers, the scale connected and empty, put the mat on, name it, tap **Scale accessory**, **Weigh & add**. Lift it. Then on Home put the mat on, and the shot cup on the mat; later, a brew with the bean cup on the mat | Setup lists the mat with "Scale accessory" and about 15.5 g. With the mat on, Home still says "Put a container down" and stays; the cup on it opens the brew, recognised, at its own weight. The beans weigh what is poured, without the mat. Also: a container learned with the mat under it weighs without the mat | |

If K1's masses differ by more than 0.3 g between placements, note them: the match allows 0.3 g
below a container's mass (`PROVISIONAL(U1.1: K2)`), and the settling 3 s and 0.5 g
(`PROVISIONAL(U1.1: K1)`).

## The brew's phases on the phone (T2.5)

The brew screen now has the phase stepper (Beans, Grind, Extraction, Milk), and the containers
learned in Setup open their phase when put down (D-079). Learn your dosing cup with the roles
Bean cup and Grind cup, your shot cup as Cup, and your milk jug as Milk jug (S5); pick a milk
drink as the recipe for P5. Then, on the brew screen, connected:

| # | Check | Expected | Result |
| --- | --- | --- | --- |
| P1 | Open the brew screen with nothing on the scale | It starts on Beans ("Put the bean cup on the scale"), the beans' target the basket's size | |
| P2 | Put the dosing cup on, pour the beans in | "Dosing cup · recognised"; the beans count up against the target, "Target reached" within 1 g | |
| P3 | Lift it, grind, put it back with the grounds | Grind opens by itself, the cup "recognised: back at the beans' weight minus retention", the ground weight and the retention shown. Note how long it was off: under 8 s it isn't taken for the grounds (`PROVISIONAL(U1.1: P3)`) | |
| P4 | Lift it, put the shot cup on, tap Start with the pump | Extraction opens with the cup recognised, the target the ground weight × the ratio ("ground"); the shot runs as before. On the card: Beans and Grind with the analysis's weights (within 0.2 g of what the scale showed), the extraction's ratio over the ground weight | |
| P5 | With a milk drink: put the jug down with the card open, pour the milk, tap Done (once right as the pour ends, before the scale settles) | The milk view, the milk against the yield × the milk ratio; Done goes back to the card, which shows the milk within about 10 s ("Reading…" until then), in whole grams | |
| P6 | Another brew, tapping the tabs instead: Extraction straight away, Start | Beans and Grind skipped on the card; the target the basket's size ("basket") | |
| P7 | Open History, the shot from P4 | Its page shows the beans, the grind with the retention, and the ratio over the ground weight | |
| P8 | On Beans, tap Basket, pick another basket; tap Pack, pick an unopened pack | The target becomes that basket's size, and the row says "was … · now the default"; the pack shows "· day N", and Setup › Coffee packs lists it as open from today | |
| P9 | Tap Pack, then Finish <pack>, Would buy again, Finish pack | The row says None; Setup lists the pack as finished, "Would buy again" | |
| P10 | On Grind, tap + on the setting, then pick the other grinder | The setting steps 0.1 (stepless) or 1 (clicks), "was … · now the default"; Setup › Grinders shows the new setting. After a few shots with both phases, "Last 5" lists the retentions | |
| P11 | For P5's milk, first learn a second container 2 g heavier than the jug (the jug with 2 g of beans in it, for milk, named "Jug + 2 g"; remove it in Setup afterwards). Put the empty jug down with the card open; open Milk ratio and pick another milk drink | The jug's card warns "Close to Jug + 2 g"; "Not the jug?" picks that one, and the warning goes. The target follows the new ratio, and the card's title and milk row the new drink | |
| P12 | Grade a shot **Sour** on its card and Save; start the next brew with the same machine, grinder and pack. Then tap ✕ on the nudge, and reopen the app. Then grade a shot Balanced | Beans (and Grind) say "Last time it was sour: grind a little finer for a more balanced cup", with the shot's day, time and grind setting; ✕ hides it, and it stays hidden after reopening; after the balanced shot there is none | |
| P13 | Pour the beans into the bean cup, lift it, pour them into the grinder, and put the empty cup back (after 8 s or more). Another brew: lift the cup with its beans, tap Grind, then Beans, and put the empty cup back | Grind opens, Beans done with the weight poured; the empty cup doesn't count the beans from 0. In the second, the same: the taps don't lose the beans | |
| P14 | On the extraction, tap Start with the pump off, and tap ✕ within 15 s. Open Brew again. Then pull a shot, and tap ✕ with its card open | Home; the scale reads 0.0, its timer at 0:00 and stopped. Brew starts afresh (Beans with a bean cup learned), a container still on the scale its first vessel. With the card open, ✕ goes Home without touching the scale, and the card is there when you come back | |
| P15 | Sound with every brew (T2.18): open the brew and tap **Connect scale** (or, with the scale already connected, any tap but Start); allow the microphone if Safari asks. Brew and pull a shot. Then turn off Setup › Microphone › Record sound with every brew, and brew again | The iPhone's microphone indicator comes on at the tap, never at Start; the probe's Sound levels line says On. The shot's recording, exported, has `"mic"` frames from its start. Switched off, no prompt and no `"mic"` frames. Note whether Safari asked, and when (B8) | |
| P16 | On the extraction, put the shot cup down and tap **Start** with the pump within a second or two, before the scale shows 0 (T2.19) | The scale zeroes at Start, and the live view counts down from the target ("34.0 g to go"), never from 100 g or more. The card's yield matches the scale's display at the end | |
| P17 | The tares (T2.20): (1) after a shot, lift the cup (the scale reads negative) and tap Beans; (2) put the bean cup down with Home showing; (3) weigh the beans, grind, put the cup back with the grounds; (4) on the extraction, swap the bean cup for the shot cup in one quick move; (5) Setup › Containers with only the mat on | (1) the scale goes to 0; (2) the brew opens and the scale goes to 0 with the cup on; (3) the scale shows the grounds (about the beans less the retention), not 0; (4) the scale goes to 0 with the shot cup; (5) the scale goes to 0. Each once: no repeated taring. Note anything else that should have tared | |
| P18 | The grind before its grounds (T2.21): weigh the beans in the bean cup, tap **Grind** with the cup still on, lift it and grind; put the cup back with the grounds. Another brew: on Grind, tap **Skip grind** | With the beans in the cup: Ground 0.0 and "Grind the beans, then put the cup back with the grounds."; lifted: 0.0, no retention, "Put the bean cup down with the grounds to weigh the retention." Back with the grounds: their weight, and the retention (the beans less the grounds). Skip grind opens the extraction, and the card's grind row says Skipped | |
| P19 | On Grind, the cup at the grinder, put it back with its grounds, even well short of the beans (2–4 g less); lift it and put it back once more (T2.22) | The scale shows the grounds, never 0: no tare either time. Ground shows their weight and the retention (the beans less the grounds) | |

If a phase opens when it shouldn't, or doesn't open, note what was on the scale and its weight
(Setup › Containers shows each one's).

## Maintenance on the phone (T2.10)

The machine's descale and backflush and each grinder's care now have their dates (D-083): "Done
today" stamps today, and a tap on the dates sets the day it was last done and a reminder. A
reminder shows on Home once it is due, and under Setup's "Needs attention" from a week before.
Open <https://misch0n.github.io/smart-scale/#/setup/machine> in Safari with beacio, and check:

| # | Check | Expected | Result |
| --- | --- | --- | --- |
| N1 | Machine: on Descale, tap **Done today** | "Last <today>"; the button greys out | |
| N2 | Tap the dates, set **Last done** with the phone's date picker to the day you really last descaled, then + on **Reminder** until it says your interval | The badge appears when it is due ("N days overdue", red) or within a week ("in N days", yellow); Setup's Maintenance row says the next one, red when overdue | |
| N3 | Set the backflush and your grinder's care the same way; then open Home | Home has a row for each one due (not the ones only coming up), the most overdue first; a tap opens the machine or the grinders | |
| N4 | Pull a shot, then open its page with `?debug` (`#/shot/<id>?debug`) | The record's `lastDescaleDate`, `lastBackflushDate` and `lastGrinderCareDate` are the dates set above | |

If the date picker sets the wrong day (a time-zone shift), note the day picked and the day shown.

## History's filter and trend on the phone (T3.3)

History has a Filter button beside Compare (D-085). No board draws the filter or the trend, so
say what you'd change (Q29). With a week or two of shots, open
<https://misch0n.github.io/smart-scale/#/history> and check:

| # | Check | Expected | Result |
| --- | --- | --- | --- |
| F1 | Tap **Filter**, pick your coffee and your grinder, **Done** | The list keeps those shots; a line says what is filtered and "N of M shots"; a trend card appears above the list | |
| F2 | On the trend, keep **First drip** and **Grind**; then try **Ratio** and **Days off roast** | A dot per shot in its taste's colour; with three shots at different settings, a dashed line and "First drip … s per 0.1 of grind". Does finer show as slower? | |
| F3 | Tap a dot, then go back; then tap **Clear** | The dot opens its shot; back, the filter and the trend are as they were; Clear shows every shot and no trend | |

## Accessibility on the phone (T3.5)

An automated audit passes on every screen (D-086); these are what it can't hear. Turn on
VoiceOver (Settings › Accessibility, or triple-click the side button if set up), open the app,
and check:

| # | Check | Expected | Result |
| --- | --- | --- | --- |
| V1 | On Brew, swipe through from the top | It reads "Brew: extraction" (or beans, grind) as a heading, then the stepper's phases with the current one, the vessel, the equipment's rows as buttons, the target and Start | |
| V2 | On a shot's card and on History, swipe through the grades and a row | Taste reads "Sour, toggle button" and so on, with its state; Channelling reads as a switch; a History row reads its day, time, drink and taste | |

## Part A — Scale protocol (spec Phase 0, plus extras from protocol research)

| # | Question | How | Result |
| --- | --- | --- | --- |
| A1 | Notification rate | Subscribe to `FF11` with the timer running. Diff consecutive ms fields (bytes 3–5) and note the arrival spacing too | **9.93 Hz** (S1): a frame every 100.70 ms of the phone's clock, and none lost in 338 s. The timer field moves 100 ms per frame: 0.1 s ticks of the scale's own clock, which runs 0.70% slow. Arrival gaps are multiples of about 30 ms (median 91 ms, p99 152 ms) |
| A2 | Does pump vibration reach the weight signal? **(Load-bearing for the segmentation design)** | Send smoothing off (`03 0A 08 00 00 01`), put the cup on, pull a shot. Compare the weight jitter before the pump, during the pump while nothing drips yet, and after pump off | **No** (S2). In shot B the pump ran 3.3 s before the first drip. The weight held still at −0.2 g (one 0.1 g flicker), and the scale's flow figure was as quiet as at rest (σ 0.016 g/s, against 0.018–0.021 at rest). The only sign was a 0.2 g dip as the pump started, which shot A didn't show. So `pump_on` comes from the Tare + start tap at pump start (Q4, D-048) |
| A3 | Is the weight net or gross? | Put a cup on, tare, lift the cup off. A negative reading of about minus the cup's mass means net | **Net** (S1): a 9.6 g item, tared, read −9.6 to −9.7 g when lifted |
| A4 | Does `04` start the timer in flow+weight mode? | Send `03 0A 04 00 00 0D` and watch bytes 3–5. Note which mode the scale's display is in | **In the timer mode, yes** (S1): it started the timer at 257.7 and 274.4 s. In the automatic mode it did nothing, during the scale's own run (79.4 s) and after it (104.5 s). **In the flow-rate mode, no: that mode has no timer** (the user checked, 2026-10-05). The app uses the timer mode (D-038) |
| A5 | Does `07` start the timer in any mode? | Send `03 0A 07 00 00 0E` and watch bytes 3–5. Does it also tare? Try each display mode | **Not in every mode** (S1): `07` started the timer in the timer mode (291.4 s), and did nothing in the automatic mode (109.8 s) or at 141.8 s (automatic or flow-rate mode). Whether it tares didn't show, because the weight already read 0. **In the timer mode it tares too** (S2): at 264.7 s it tared a 264.8 g vessel to 0 by the next frame and started the timer. The flow-rate mode has no timer, so there `07` has none to start; whether it tares there is moot (D-038) |
| A6 | Does the Mini honour `25` (keep-alive)? | The standby bytes hold the auto-off setting and don't count down (S1), so watch the scale itself. Set its auto-off to the shortest (5 min) on the scale, stay connected, and leave the platform alone for longer than that. Does the scale switch off while connected? If it does, repeat, tapping **Keep-alive** (`03 0A 25 00 00 2C`) every minute | Not tested yet. The standby bytes read 150 (15.0 min) in every frame of S1, which is why the method changed |
| A7 | Does a physical tare emit anything? | Subscribe to `FF12` (if it supports notify) and press the scale's tare button | **Apparently nothing** (S1): a press that zeroed the scale (118.5 s, no command near it) sent no frame on FF12. FF12 did send two `03 0D` event frames, in the Ultra's layout with every other byte 0: state `01` when the scale started its own timer, and state `00` at the app's stop that ended it |
| A8 | Container masses | Weigh the empty bean cup, espresso cup(s) and dosing cup, if you have one | Seen in S2, not yet named: 119.8–119.9 g (the dosing cup, for beans and grounds), and 264.8 g and 257.3 g (the vessels of shots A and B) |
| A9 | Unit byte value | Byte 6 during normal use, in grams | **`01`** in every frame (S1) |
| A10 | Sign byte values | Byte 7 with a positive weight, then a negative one (lift a tared cup). Byte 11 if the flow ever goes negative | **`2B` (+) and `2D` (−)**, for both the weight and the flow (S1) |
| A11 | Weight resolution and noise at rest | Smallest weight step seen (0.01 g? 0.1 g?), and the jitter over 10 s on an empty, still platform with smoothing off | **0.1 g** (S1). 3,340 of 3,359 readings are whole tenths. The other 19, all while the weight moved fast, are a hundredth short (38.59 g): the scale truncates a float. **At rest the reading doesn't move**: not once in 92, 82 and 30 s with a tared item on, nor in 17 and 12 s empty. With the 9.6 g item on, there was one flicker in 28 s. The scale's own flow figure (0.01 g/s steps) does move at rest (σ 0.018 g/s). BOOKOO's published specification is 0.1 g. The finer digits the user saw on the display were the flow figure's, not the weight's |
| A12 | What does the timer do after stop and reset? | After `05` (stop), do bytes 3–5 freeze or go to zero? After `06` (reset)? | **`05` freezes it, and `06` zeroes it only once stopped** (S1). `06` while it runs is ignored. `04` doesn't resume a frozen timer, so a restart takes `06`, then `04`. The exception was the run the scale had started itself: `05` sent that one straight to 0, and zeroed the weight too |
| A13 | Does smoothing off take effect? | After `03 0A 08 00 00 01`, does byte 18 read `00`? | **Yes** (S1): `01` in the first frame, `00` from the second (0.2 s) |
| A14 | What does the scale advertise? | Device name. Is service `0FFE` in the advertisement? | Name **`BOOKOO_SC 109813`** (S1). The advertisement can't be seen from the browser |
| A15 | Characteristic properties | `FF11` and `FF12`: read / write / write-without-response / notify / indicate | **Both: read, write, notify** (S1). Neither has write-without-response or indicate |
| A16 | Do weight frames carry a valid checksum? | Does byte 20 equal the XOR of bytes 1–19? Older doc revisions showed `00` there | **Yes** (S1): all 3,361 frames, the two FF12 frames included |

## Part B — Runtime: the deployed app on iOS (beacio, then Bluefy)

App URL: <https://misch0n.github.io/smart-scale/> (live; every push to `main` redeploys it).

Run each test in beacio, the Safari web extension, which is the runtime you'd rather use
(D-016). It works only in a Safari tab, not from a home-screen icon (B9). If a test fails there,
repeat it in Bluefy and record both results, so we know whether falling back would help.

| # | Question | How | Result |
| --- | --- | --- | --- |
| B1 | Which browser APIs does the runtime expose? | Open the app. The home page shows a capability table: screenshot it | **All eight present in both beacio and Bluefy** (2026-10-03, iOS): secure context, Web Bluetooth, `getDevices()`, IndexedDB, `storage.persist()`, Wake Lock, Web Share, `getUserMedia`. The table only checks that each function exists; B3 and B5–B9 test whether they work. User agents weren't captured |
| B2 | Does connecting work? | Probe screen → Connect → pick the scale in the chooser. If it fails, copy the message: it names the step that failed | **Yes** (2026-10-04, S1): connected on the iPhone, with Safari's user agent (so presumably beacio), and frames arrived for 338 s without a break |
| B3 | Can it reconnect without the chooser? **(Spec: "Re-pairing — check early")** | Since T1.21 the app tries by itself: connect once, reload the page, and see whether it reconnects with no tap. Repeat after force-quitting the browser (Safari for beacio). The checks R1–R7 above go through it. If it fails, copy what the probe's Connection panel says: the last error lists the devices the browser still knows | |
| B4 | What happens when the screen locks or the browser goes to the background? | While connected, lock the phone for 30 s, then unlock. Is there a gap in the frames? Did the connection survive? | |
| B5 | Does Wake Lock keep the screen on? | Stay connected and idle past the normal auto-lock time | |
| B6 | Does storage persist? | Note the persistence result on the probe screen. Close the browser and reopen: are the recordings still there? | |
| B7 | How do exported files get off the phone? | Export a recording: tap Export, then Download, and Share… if it's offered (it shows only where the browser says it can share files). Does a file download? Does the share sheet appear? Where can you save it? Then import the file in the other runtime (Bluefy if you exported from beacio): does the file picker open, and does the recording appear? Also note where Safari saves downloads (Settings › Apps › Safari › Downloads; iCloud Drive by default): if it's iCloud Drive, Download alone is an iCloud backup (D-026) | **Partly** (S1): an export reached an agent session. Which button was used, where it was saved and the import weren't noted |
| B8 | Microphone (Phase 3 audio) | Is `getUserMedia` listed in the capability table? If yes, does a permission prompt appear when tried? Does it ask again after you close and reopen the browser? | Listed: yes in both runtimes (B1, 2026-10-03). Tried in S1: seven tries, each `granted` with the track "iPhone Microphone". Whether a prompt appeared wasn't noted. **Each try held the scale's notifications back for 0.46–0.71 s**, though none was lost. S2: two more tries, both `granted`, with the same hold-up. The button only checks access, so nothing was recorded; T1.24 records sound levels |
| B9 | beacio only: does it work from a home-screen icon? The spec's storage-eviction and microphone re-prompt concerns are about sites that aren't installed | In Safari: Share → Add to Home Screen (leave "Open as Web App" on if it's offered). Open the app from the icon. Does it open without Safari's address bar, and does the capability table still show Web Bluetooth? Once the probe exists: connect, then repeat B6 and B8 from the icon | **No** (2026-10-03): opened from a home-screen icon, beacio isn't available, so there is no Web Bluetooth there. beacio works only in a Safari tab, where the app counts as a site that isn't installed. The rest of this test is moot |
| B10 | Does automatic export reach the data repo from the phone? (T1.20, after U1.2) | Until it's set up, a red reminder at the top of the page says the recordings aren't backed up; its button opens the settings. Set it up (U1.2), tap **Test**, then **Save**: the reminder goes. Record something short with the real scale and disconnect: does a file appear in the repo under `recordings/YYYY/MM/` within a minute, and does the status say "Up to date"? Then disconnect and lock the phone at once: does the upload finish, or happen when you come back? Turn on flight mode, record again: does the status say it is waiting, and does the file arrive once you're back online? | |

## Part C — Fixture recordings to capture with the probe

Send smoothing off first, then capture each scenario as its own recording (connect, do the
scenario, disconnect). Where you can, tap the probe's annotation buttons ("pump on", "pump off",
"cup on", "cup off") as things happen. Those taps carry human latency, but they let an agent
check the detectors against something. Add a note annotation with the dose and grind setting
for each shot.

| # | Scenario | Captured |
| --- | --- | --- |
| C1 | Idle for 60 s on an empty platform (noise floor, rate) | Covered by S1: still stretches of 12–92 s, empty or with a tared item on |
| C2 | Cup on → wait 5 s → app tare+start (`07`) → wait 5 s → lift the cup → put it back → remove it | |
| C3 | Three or more normal shots, each in its own recording: cup on, settle, pump on, shot, pump off, then **wait at least 30 s** before removing the cup | S2, in part: shot A waited 35 s, but ran fast (47 g in 9 s) and the scale was moved as it began |
| C4 | Press the physical tare button with a cup on: once held for about a second, then, a few seconds later, once as a quick click. The analysis takes a held press off with its tare (D-061, from S1's); a quick click is untested | |
| C5 | A shot where the cup comes off right after pump off (honest yield) | S2: shot B, lifted 4 s after pump off |
| C6 | Ten minutes connected and idle (standby countdown, keep-alive test) | |

Hand the exported files to an agent (upload them in a session). It adds them to `fixtures/real/`
with a README describing each one.

## Sessions

### Session 1 — 2026-10-04, the probe's commands (no shot)

One recording of 338 s, exported while still connected:
`fixtures/real/2026-10-04_probe-session_20444bd0.json`, whose README lists what happens when.
The setup was an iPhone with Safari's user agent (presumably beacio), app `a17c07c`, and the
scale `BOOKOO_SC 109813` at 70% battery. There were probe commands, a 9.6 g item tared, lifted
and put back, presses on the platform, and seven microphone tries. No annotations, no shot. The
agent read it with the app's own decoder, timeline and segmentation.

Beyond the table:

- **The timer is a tick counter.** Every timer value is a multiple of 100 ms, and while the
  timer runs it moves one tick per frame. Ticks and samples share the scale's clock, which runs
  0.70% slow against the phone's (fitted drift −6,937 ppm, inside the timebase's 2% limit). A
  tick came twice once, 1 s into a run (1.9 s, at 28.4 s). The timeline treats that as a gap
  between two runs.
- **No frame was lost.** One regular grid of 100.70 ms fits all 3,359 FF11 arrivals. Outside the
  microphone stalls, every arrival is within −22 to +119 ms of it, and the median doesn't shift
  across the stalls. Against the timer, arrivals are late by a median of 16 ms (p95 33 ms).
- **The scale has three modes**, by BOOKOO's description: flow rate (weight and flow), timer
  (weight and time), and automatic (it tares when a cup goes on, and times from the first
  liquid). It doesn't report its mode over Bluetooth. By the user's account, it started in
  automatic mode, then went to flow rate, then to timer, the mode the app will use (D-038). The
  switch times weren't noted.
- **The automatic mode ran its own timer** from 27.45 s, as the item went on, with no command
  near it. Its first frame already read 1.1 s, and FF12 sent `03 0D 01` (started). While that
  run lasted, the app's two tares (72.0 and 75.9 s) did nothing. The app's `05` at 82.3 s ended
  it. The timer read 0 in the next frame and FF12 sent `03 0D 00` (stopped). The weight went to
  0 0.1 s later, with the item still on.
- **`04` and `07` did nothing from 82.3 s to at least 141.8 s** (five tries): in automatic mode,
  and perhaps in flow-rate mode after about 115 s. By 257.7 s the scale was in timer mode, and
  from then on every timer command worked as A12 says.
- **Response times**, measured from the `command-sent` event, which the recorder logs once the
  write is acknowledged:
  - a tare showed within two frames (0.09–0.18 s);
  - a reset after 0.03–0.06 s;
  - a stop by the next frame;
  - the first ticking frame 0.14–0.21 s after a start.

  The smoothing check confirmed on a frame 1 ms before the command's own event, for the same
  reason.

  So a tare or a start shows a frame later than a stop or a reset: the frame after a tare's
  acknowledgment never showed it, and `07`'s timer started a frame after its tare. The
  simulator does it that way (T1.22, D-021): replaying this session's timer commands into it
  gives the three timer runs to the tick.
- **Opening the microphone holds Bluetooth back.** Each `getUserMedia` stalled the
  notifications for 0.46–0.71 s, and then the held frames arrived in a burst (T3.1).
- **The battery** read 70% throughout, and the buzzer 0.

Still to do after session 1: see session 2's list.

### Session 2 — 2026-10-05, beans, grounds and two shots

One recording of 613 s: `fixtures/real/2026-10-05_two-shots_0a69da56.json`, whose README lists
what happens when. The setup was the same iPhone and scale, with app `e954579`. The scale was in
its timer mode. Beans were dosed into the dosing cup (17.7 g, then 17.1 g), the grounds weighed in
it (17.2 g, then 17.1 g), and two shots pulled. Each shot was started with **Tare + start** at
the same moment as the pump (the user's account). There were no annotations. The agent read it
with the app's analysis (`analyzeRaw`, T1.14).

- **A2: no vibration.** See the table. With the pump on, the weight and the scale's flow figure
  read as they do at rest, so the scale can't tell when the pump starts. The user chose the
  Tare + start tap as `pump_on` (Q4, D-048). The 0.2 g dip as shot B's pump started may be worth
  watching on more shots.
- **The shots.**
  - Shot B: first drip about 3.7 s after the tap, a flow building to about 1.75 g/s, pump off at
    about 35.7 s, and 35.1 g.
  - Shot A: first liquid 3.3 s after the tap, then about 5.4 g/s for 6 s, pump off at about
    11.8 s, and 47.3 g. As it began, the scale was moved because it was off centre, and the
    readings swung between −57 and +30 g for 2 s.
- **The drip stops fast.** After pump off the flow dies within about 0.8 s, and the tail is
  0.1–0.3 g. That is much shorter than the simulator's (τ about 1.5 s), so the tail fit refuses
  it (`tail-too-short`).
- **Tenths sent a hundredth short, at rest too.** 746 of 6,085 readings end in 9 hundredths: the
  264.8 g vessel reads 264.79, and shot B settles on 35.09. Every reading is within 0.01 g of a
  tenth.
- **Two new FF12 frames at 6 s,** of types the decoder doesn't know:
  - `03 0C 00 8D`, then "SN" and a 12-character serial number (masked in the fixture), then `01`;
  - `03 0E 01 07`, then zeros.

  Nothing in the log explains them. They may come when the scale wakes or reconnects.
- **What the analysis made of it**, before any tuning (T1.16 has the list):
  - shot B's pump_off came from the regime change, about 0.15 s early, and the yield within 0.2 g
    (35.3 g: the baseline was taken inside the pump's dip);
  - shot A's yield read 39.0 g, not 47.3 g, because the moved scale was taken for two steps;
  - neither shot counted as espresso, so neither would get a post-hoc shot (D-047). It has no
    pump_on, and the tail is too short;
  - the bean pour (28–34 s) was found as a window and rightly not called espresso;
  - the quantum read 0.09 g, because of readings like 35.09.

- **After T1.16's first part** (D-058, analysis version 2): the quantum reads 0.1 g; shot A
  47.3 g with its first drip at 267.97 s; the beans 17.7 g; both shots espresso, pump_on from
  the Tare + start tap: first-drip times 3.24 s (A) and 3.40 s (B), totals 11.56 s and 35.67 s.
  Shot B's yield (35.3 g, its baseline in the pump's dip) and first drip (0.2–0.3 s early) are
  the next part.

- **After T1.16's second part** (D-059, analysis version 3): the yields are measured from the
  level before the pump, so shot B's dip no longer counts: 35.1 g, honest yield 35.1 g (the
  hand's press before the lift is part of the lift now). First drips 267.99 s (A) and 554.74 s
  (B): first-drip times 3.26 and 3.66 s, totals 11.56 and 35.69 s. The drain comes from the
  pump_off knee: τ 0.28 s (A) and 0.18 s (B), w(pump_off) 45.8 and 34.8 g, tails 1.5 and 0.3 g.
  No tail is refused now.

- **The microphone wasn't recording.** The two tries (251.4 and 303.5 s) were the probe's
  access check, which stops the stream at once. No sound was kept, and none was meant to be: T1.24
  adds recording (D-049).
- **The surf.** The user runs the pump through the group for several seconds before each shot.
  The scale doesn't see it, but before each shot the reading plunges to −150 to −400 g for about
  1.5 s and comes back (234.5 s, and 542.1–546.5 s). That is what lifting the scale looks like. A
  microphone would hear the surf, so D-049 takes the pump run the first drip falls into.

### Session 3 — 2026-10-06, the first brew with the app

Setup's **Export all** from the phone, app `7ec6888`: `fixtures/real/2026-10-06_first-brew_all.json`,
whose README has the day's recordings. The user brewed with the phases (beans, grind, the
extraction, milk) and pulled one shot, a Cappuccino graded sour. In the user's words: it went
fine overall, with a few finicky points. What the recordings and the user say:

- **The shot** (08:31, the last recording): Start with the pump at 118.1 s, first drip 3.4 s
  later, flow from 0.5 to 1.8 g/s, the pump off at about 146.7 s, **34.8 g**, drained within
  half a second (τ 0.16 s). The analysis missed the pump off: T1.26 fixed it (25.2 s of
  extraction, 28.6 s in all, 1.37 g/s). The milk: 199.3 g, against 104 g for the recipe.
- **The silicone mat** (15.5 g), put on while connected, was taken for a vessel: whatever went on
  it was its contents, so containers weren't recognised until it came off. The user wants it
  known and ignored (Q30: a container role, T2.17).
- **The beans lost:** the empty bean cup back after its beans were weighed counted the beans
  from 0 again, by itself in one recording and after a tap back to Beans in the next. The user
  poured again (T2.14).
- **The scale's timer left running:** a second Start with no shot, then leaving the brew. ✕
  should reset the scale (T2.15).
- **Home** suggested the brew for a container put down instead of opening it (Q31: T2.16).
- **No sound recorded:** the user expected every brew to record the microphone's levels (Q32:
  T2.18, which does so from the brew screen's first tap but Start). Record sound was off on the
  probe.
- **The page hidden** (193 s of the fourth recording) and the scale disconnected 30 s later:
  B4's question, seen once. The beans and the grounds were weighed in that recording, the shot
  in the next, so the shot's card can't show them: the analysis reads one recording at a time.
- **Taring during the phases:** the user will test how the scale should be tared without getting
  in the way, and report (Q33).

### Session 4 — 2026-10-06, the second brew, with sound

Setup's **Export all** at 09:01, app `7ec6888` again (the morning's fixes, T1.26–T2.18, were
deployed after it): `fixtures/real/2026-10-06_second-brew.json`, the export trimmed to the
session's three recordings (its README has them). The user brewed a Cappuccino (graded bitter)
with the probe's Record sound on. What the recordings and the user say:

- **The shot** (08:59): Start with the pump at 267.5 s, first drip 3.5 s later, the pump off at
  301.6 s, **37.9 g**, 30.6 s of extraction, 1.24 g/s; the cup lifted 3 s after the pump
  stopped (`tail-too-short`). Beans 17.1 g and grounds 17.0 g (retention 0.1 g); milk 196.9 g.
- **"130 g to go" during the shot:** the coffee cup went on in a quick swap with the bean cup
  (199.9–201.3 s), too fast for the live view to see the bean cup off, so it wasn't tared and the
  scale read 128 g. Start's tare zeroed it, and its reading arrived before the app logged the
  `07`: the live view took it for 128 g gone, and counted down from "162 g to go" (T2.19, T2.20).
- **No tare for the beans:** the bean cup was put on with Home showing; the live view's tare came
  then, with no brew screen to send it, and the screen opened 2 s later (T2.20).
- **The user's rule** (Q33): tare the scale at the start of each phase when nothing is on it or
  it reads negative, and use taring more wherever it helps, since the app works with the real
  weight (T2.20).
- **The grind phase with the cup lifted** showed the beans' weight, and a retention of the whole
  beans: it should ask for the bean cup with the grounds, or to skip the phase (T2.21). The grind
  had been tapped with the beans still in the cup, and the analysis counted those as grounds too.
- **Registering a container on the mat** read 15.5 g, the mat's weight: this build took the mat
  for the vessel and the container for its contents. T2.17 (the mat as a scale accessory, and
  learning by the last thing put on) covers it; Setup also tares an empty scale now (T2.20).
- **The sound:** the pump shows as the 40–70 Hz band at about −68 dB, steady from the tap to the
  pump's stop (pump_off by the weights within 0.03 s); the grinder is broadband (70 Hz–4 kHz,
  −63 to −70 dB) with the 40–70 Hz band near −90 dB; quiet is about −99 dB. The "50 Hz
  harmonics" measure rises for both. No milk steaming in the recordings. Data for T3.1.

### Session 5 — 2026-10-06 evening, a test of the grind

App `ce31f2e` (T2.14–T2.21). Setup's **Export all** the next morning:
`fixtures/real/2026-10-06_evening-grind.json`, trimmed to the test's one recording (its README
has it). The beans and the grind on the mat, no shot. The user: "the grind phase tares
unexpectedly and continued doing so which makes it unusable".

- **The grind tared the grounds away, three times.** Grind was tapped with the bean cup at the
  grinder; the cup came back with **14.6 g of grounds from 17.8 g of beans**, 3.2 g short. The
  router took a cup back as the grounds only up to 2 g short (`retentionMaxG`), so the grind
  held nothing, and the live shot's tare for a cup put down went out: the scale read 0. Each
  lift and put-back after did the same (151.9 s, 177.1 s). T2.22: with the grind open, the cup
  back with anything up to the beans is the grounds, so its tare is dropped (D-098).
- The analysis had it right all along: beans 17.8 g, grounds 14.6 g.
- In the recording, the mat, learned as a scale accessory, stayed out of the way under the bean
  cup, and Setup tared the empty scale with it on (what K7 and P17 (5) check).

Still to do (U1.1):

- **T1.24's check**, in the next session. Every brew now turns the sound levels on at its first
  tap but Start (T2.18, P15); on the probe, turn on **Record sound** before or after Connect.
  1. Allow the microphone if asked. The Sound levels line should read "On: … readings from
     iPhone Microphone at 48000 Hz", and the levels should move when you talk or grind. If every
     level stays at "≤ -127.5 dB", the meter isn't getting audio: say so.
  2. While connected, the line counts the levels "in this recording". The events list shows
     "sound levels start", or "sound levels continue" if Record sound came before Connect.
  3. The scale keeps streaming: Recording → Frames stays near 10/s. A Record sound tap during a
     recording holds the scale back for about half a second, once.
  4. Disconnect, then Connect: the levels stay on, and the new recording shows "sound levels
     continue".
  5. Optional (B4): lock the phone, or switch apps, for 10 s, then come back. Note what the
     events list shows ("sound levels pause" and "resume", or nothing).
  6. Export: the file's frames include `"mic"` rows.
- Three normal shots, as C3 describes: one per recording, waiting at least 30 s before lifting the
  cup, with Tare + start at the pump as you did. Tapping **pump off** when the pump stops would
  give the pump_off detector something to be checked against. Turn on **Record sound**, and surf
  as you normally would.
- A6, with the new method.
- A7 once more: a single press of the tare button, with nothing else going on.
- A8: name the containers seen in session 2, or weigh the others.
- The reconnect, R1–R7 (T1.21), which answers B3.
- The mode check, M1–M5 (T1.25).
- B4–B6 and B10, the rest of B7, and C2, C4 and C6.
