class Version {
    constructor(v) {
        const splits = v.split(".");
        this.major = splits[0];
        this.minor = splits[1];
        this.preRelease = '';
        if (splits.length > 2) {
            let patchWithPreRlease = splits.slice(2).join('.').split("-");
            this.patch = patchWithPreRlease[0];
            if (patchWithPreRlease[1]) {
                this.preRelease = patchWithPreRlease.slice(1).join('-');
            }
        }

    }

    newerOrEqualTo(v) {
        return this.compare(new Version(v)) >= 0;
    }

    compare(other) {
        console.log(`comparing ${this} with ${other}`);
        console.debug(`compare ${this} with ${other}`);
        if (this.major !== other.major) {
            return Math.sign(this.major - other.major);
        }
        if (this.minor !== other.minor) {
            return Math.sign(this.minor - other.minor);
        }
        if (this.patch !== other.patch) {
            if (this.patch === null) {
                return -1;
            }
            console.log(`comparing patch ${this.patch} to ${other.patch}`);
            return this.patch.localeCompare(other.patch);
        }
        if (this.preRelease !== other.preRelease) {
            if (this.preRelease == '') {
                return 1;
            }
            if (other.preRelease == '') {
                return -1;
            }

            console.log(`comparing prerelese ${this.preRelease} to ${other.preRelease}`);
            return this.preRelease?.localeCompare(other.preRelease);
        }  
        return 0;
    }

    toString() {
        return `${this.major}.${this.minor}.${this.patch}.${this.preRelease}`;
    }
}

let v1 = new Version('1.1.0');
let v2 = new Version('1.1.0-alpha-1');
let v3 = new Version('1.1.0-alpha-2');
let v4 = new Version('1.1.0-beta-2');
let v5 = new Version('1.1.1-beta-2');
let v7 = new Version('1.1.1-beta-2.1');
let v6 = new Version('1.1.1');

console.log(v1.compare(v2));
console.log(v2.compare(v3));
console.log(v1.compare(v3));
console.log(v1.compare(v4));
console.log(v2.compare(v4));
console.log(v3.compare(v4));
console.log(v1.compare(v5));
console.log(v6.compare(v5));
console.log(v7.compare(v5));
