/// <reference path="../index.ts" />

module Epoch.Util {

    export class SvgPathBuilder {
        private path: (string|number)[];
        private initialPosition: [number, number];
        private currentPosition: [number, number];

        constructor(public useAbsolute: boolean) {
            this.path = [];
            this.currentPosition = [0, 0];
            this.initialPosition = [0, 0];
        }

        private saveCurrentPosition(x: number, y: number): void {
            if (x !== null) {
                this.currentPosition[0] = x;
            }
            if (y !== null) {
                this.currentPosition[1] = y;
            }
        }

        private saveInitialPosition(x: number, y: number): void {
            if (x !== null && y !== null) {
                this.initialPosition[0] = x;
                this.initialPosition[1] = y;
            }
        }

        public absolute(): SvgPathBuilder {
            this.useAbsolute = true;
            return this;
        }

        public relative(): SvgPathBuilder {
            this.useAbsolute = false;
            return this;
        }

        public moveTo(x: number, y: number): SvgPathBuilder {
            this.path.push(this.useAbsolute ? 'M' : 'm', x, y);
            this.saveInitialPosition(x, y);
            this.saveCurrentPosition(x, y);
            return this;
        }

        public simpleBezierTo(x2: number, y2: number, x: number, y: number): SvgPathBuilder {
            this.path.push(this.useAbsolute ? 'S' : 's', x2, y2, x, y);
            this.saveCurrentPosition(x, y);
            return this;
        }

        public bezierTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): SvgPathBuilder {
            this.path.push(this.useAbsolute ? 'C' : 'c', x1, y1, x2, y2, x, y);
            this.saveCurrentPosition(x, y);
            return this;
        }

        public horizontalTo(x: number): SvgPathBuilder {
            this.path.push(this.useAbsolute ? 'H' : 'h', x);
            this.saveCurrentPosition(x, null);
            return this;
        }

        public verticalTo(y: number): SvgPathBuilder {
            this.path.push(this.useAbsolute ? 'V' : 'v', y);
            this.saveCurrentPosition(null, y);
            return this;
        }

        public arcTo(rx: number, ry: number, rAxisRotation: number, largeArcFlag: boolean, sweepFlag: boolean,
                     x: number, y: number): SvgPathBuilder {
            this.path.push(this.useAbsolute ? 'A' : 'a', rx, ry, rAxisRotation, largeArcFlag ? 1 : 0, sweepFlag ? 1 : 0, x, y);
            this.saveCurrentPosition(x, y);
            return this;
        }

        public close(): SvgPathBuilder {
            this.path.push('Z');
            this.saveCurrentPosition(this.initialPosition[0], this.initialPosition[1]);
            return this;
        }

        /**
         * Draws a concave curve starting from the current position, where the concavity is defined by the `isClockwise`
         * parameter.
         *
         * @param x the final x position
         * @param y the final y position
         * @param isClockwise
         * @returns {SvgPathBuilder}
         */
        public roundTo(x: number, y: number, isClockwise: boolean = true): SvgPathBuilder {
            let rx, ry: number;
            rx = x - this.currentPosition[0];
            ry = y - this.currentPosition[1];
            return this.arcTo(rx, ry, 0, !isClockwise, isClockwise, x, y);
        }

        public build(): string {
            return this.path.join(' ');
        }
    }
}
