/**
 * Zegar symulacji.
 *
 * Czas jest liczony w krokach, nie w milisekundach zegara ściennego. Przy
 * prędkości 10× nie chodzi o to, żeby liczyć dziesięć razy szybciej — tylko
 * żeby na każdą klatkę obrazu przypadało dziesięć razy więcej kroków
 * symulacji. Dzięki temu przebieg jest identyczny niezależnie od tego, jak
 * obciążona jest przeglądarka, a nagranie z wolnego komputera zgadza się
 * z nagraniem z szybkiego.
 *
 * Zegar nie wywołuje niczego sam: dostaje upływ czasu rzeczywistego i zwraca
 * chwile, które trzeba przeliczyć. Kto je zużyje — widok czy zapis przebiegów
 * — nie jest jego sprawą.
 */

export type Speed = 0.5 | 1 | 2 | 10;

export const SPEEDS: readonly Speed[] = [0.5, 1, 2, 10];

export interface ClockState {
    /** Chwila symulacji w mikrosekundach. */
    t_us: number;
    running: boolean;
    speed: Speed;
}

export class SimulationClock {
    private t = 0;
    private running = false;
    private speed: Speed = 1;
    /** Reszta kroku przeniesiona na następne wywołanie. */
    private carry = 0;

    constructor(private readonly stepUs: number) {}

    get state(): ClockState {
        return { t_us: this.t, running: this.running, speed: this.speed };
    }

    start(): void { this.running = true; }
    stop(): void { this.running = false; }

    setSpeed(speed: Speed): void { this.speed = speed; }

    /** Przewinięcie do wskazanej chwili — bez odtwarzania tego, co pomiędzy. */
    seek(t_us: number): void {
        this.t = Math.max(0, t_us);
        this.carry = 0;
    }

    reset(): void {
        this.t = 0;
        this.carry = 0;
        this.running = false;
    }

    /**
     * Posuwa zegar o podany upływ czasu rzeczywistego i zwraca chwile, które
     * wypadły w tym przedziale.
     *
     * Reszta niepełnego kroku jest przenoszona, a nie zaokrąglana: przy 60
     * klatkach na sekundę i kroku 1 ms zaokrąglanie gubiłoby co czwarty krok
     * i symulacja zostawałaby w tyle o kilkanaście procent.
     */
    advance(elapsedMs: number): number[] {
        if (!this.running || elapsedMs <= 0) return [];

        const wanted = elapsedMs * 1000 * this.speed + this.carry;
        const steps = Math.floor(wanted / this.stepUs);
        this.carry = wanted - steps * this.stepUs;

        // Ogranicznik: po powrocie z uśpionej karty upłynęły minuty, a nadrabianie
        // ich krok po kroku zawiesiłoby przeglądarkę na kilkanaście sekund.
        // Lepiej przeskoczyć i powiedzieć o tym, niż udawać, że nic się nie stało.
        const limited = Math.min(steps, MAX_STEPS_PER_FRAME);
        if (limited < steps) {
            this.t += (steps - limited) * this.stepUs;
            this.skipped += steps - limited;
        }

        const times: number[] = [];
        for (let i = 0; i < limited; i++) {
            this.t += this.stepUs;
            times.push(this.t);
        }
        return times;
    }

    private skipped = 0;

    /** Ile kroków pominięto z powodu ograniczenia — do pokazania w interfejsie. */
    get skippedSteps(): number { return this.skipped; }
}

/**
 * Najwyżej tyle kroków na jedno wywołanie.
 *
 * Wartość dobrana tak, by przy kroku 1 ms nadrobić sekundę zaległości —
 * czyli typowe zacięcie — nie blokując wątku na dłużej niż moment.
 */
const MAX_STEPS_PER_FRAME = 1000;
