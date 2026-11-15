/**
 * Whether this device's main pointer is a finger: phones and tablets.
 *
 * Read by components that behave differently on touch screens, such as the
 * tap-to-add section picker, which laptops don't use (they drag instead).
 * It's the same test as the CSS `@media (pointer: coarse)` rules, and it
 * stays up to date if that changes (for example, in a browser's device
 * emulation tools).
 */
class Device {
  touch = $state(false);

  constructor() {
    const query = window.matchMedia("(pointer: coarse)");
    this.touch = query.matches;
    query.addEventListener("change", (event) => (this.touch = event.matches));
  }
}

export const device = new Device();
